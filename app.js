/* Roshan Cloths Store — local-first IndexedDB application */
(() => {
"use strict";
const DB_NAME = "RoshanClothsStoreDB";
const DB_VERSION = 1;
const STORE_NAMES = ["products", "customers", "sales"];
let db;
let currentSaleDetailId = null;
let toastTimer;

const $ = id => document.getElementById(id);
const money = value => new Intl.NumberFormat("en-IN", {style:"currency",currency:"INR"}).format(Number(value)||0);
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};
const dateTime = value => new Date(value).toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"short"});
const safe = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uid = prefix => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;

function showToast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}
function openDB() {
  return new Promise((resolve,reject) => {
    if (!("indexedDB" in window)) return reject(new Error("This browser does not support IndexedDB."));
    const request = indexedDB.open(DB_NAME,DB_VERSION);
    request.onupgradeneeded = () => {
      const d = request.result;
      if (!d.objectStoreNames.contains("products")) {
        const s = d.createObjectStore("products",{keyPath:"id"});
        s.createIndex("name","name",{unique:false});
      }
      if (!d.objectStoreNames.contains("customers")) d.createObjectStore("customers",{keyPath:"id"});
      if (!d.objectStoreNames.contains("sales")) {
        const s = d.createObjectStore("sales",{keyPath:"id"});
        s.createIndex("date","date",{unique:false});
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function requestPromise(request) {
  return new Promise((resolve,reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function all(store) {
  return requestPromise(db.transaction(store,"readonly").objectStore(store).getAll());
}
async function get(store,id) {
  return requestPromise(db.transaction(store,"readonly").objectStore(store).get(id));
}
async function put(store,value) {
  return requestPromise(db.transaction(store,"readwrite").objectStore(store).put(value));
}
async function remove(store,id) {
  return requestPromise(db.transaction(store,"readwrite").objectStore(store).delete(id));
}
async function clearStore(store) {
  return requestPromise(db.transaction(store,"readwrite").objectStore(store).clear());
}
function setPage(page) {
  document.querySelectorAll(".page").forEach(el => el.classList.toggle("active",el.id === `page-${page}`));
  document.querySelectorAll("[data-page]").forEach(el => el.classList.toggle("active",el.dataset.page === page));
  const titles = {dashboard:"Dashboard",products:"Products",sales:"Sales & Billing",customers:"Customers",reports:"Reports",backup:"Backup & Settings"};
  $("page-title").textContent = titles[page] || "Dashboard";
  document.body.classList.remove("mobile-menu-open");
  if (page === "dashboard") renderDashboard();
  if (page === "products") renderProducts();
  if (page === "sales") renderSales();
  if (page === "customers") renderCustomers();
  if (page === "reports") renderReports();
  if (page === "backup") renderStorageStatus();
}
async function refreshAll() {
  await Promise.all([renderDashboard(),renderProducts(),renderSales(),renderCustomers(),renderReports()]);
  await updateCustomerOptions();
}
function stockStatus(p) {
  if (Number(p.stock) <= 0) return '<span class="stock-tag out">Out of stock</span>';
  if (Number(p.stock) <= Number(p.threshold ?? 5)) return '<span class="stock-tag low">Low stock</span>';
  return '<span class="stock-tag">In stock</span>';
}
function emptyTable(message) { return `<div class="table-empty">${safe(message)}</div>`; }

async function renderDashboard() {
  const [products,customers,sales] = await Promise.all([all("products"),all("customers"),all("sales")]);
  const todaySales = sales.filter(s => String(s.date).slice(0,10) === todayKey());
  $("stat-today-sales").textContent = money(todaySales.reduce((sum,s)=>sum+Number(s.total||0),0));
  $("stat-products").textContent = products.length;
  $("stat-stock").textContent = products.reduce((sum,p)=>sum+Number(p.stock||0),0);
  $("stat-customers").textContent = customers.length;
  const recent = [...sales].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,5);
  $("recent-sales").innerHTML = recent.length ? `<table class="data-table"><thead><tr><th>Invoice</th><th>Customer</th><th>Amount</th><th>Date</th></tr></thead><tbody>${recent.map(s=>`<tr><td>${safe(s.invoice)}</td><td>${safe(s.customerName||"Walk-in")}</td><td>${money(s.total)}</td><td>${safe(new Date(s.date).toLocaleDateString("en-IN"))}</td></tr>`).join("")}</tbody></table>` : emptyTable("No sales yet. Create your first sale to see it here.");
  const low = products.filter(p=>Number(p.stock)<=Number(p.threshold??5)).sort((a,b)=>a.stock-b.stock).slice(0,6);
  $("low-stock-count").textContent = `${products.filter(p=>Number(p.stock)<=Number(p.threshold??5)).length} items`;
  $("low-stock-list").innerHTML = low.length ? low.map(p=>`<div class="low-stock-item"><div><strong>${safe(p.name)}</strong><small>${safe([p.size,p.color,p.code].filter(Boolean).join(" • ")||p.category||"Product")}</small></div><span class="stock-tag ${Number(p.stock)<=0?"out":"low"}">${Number(p.stock)} left</span></div>`).join("") : emptyTable("All products have sufficient stock.");
}
async function renderProducts() {
  const products = (await all("products")).sort((a,b)=>a.name.localeCompare(b.name));
  const query = ($("product-search").value||"").trim().toLowerCase();
  const filter = $("stock-filter").value;
  const filtered = products.filter(p => {
    const searchable = [p.name,p.code,p.category,p.size,p.color].join(" ").toLowerCase();
    return searchable.includes(query) && (filter==="all" || (filter==="low" && p.stock>0 && p.stock<=Number(p.threshold??5)) || (filter==="out" && Number(p.stock)<=0));
  });
  $("products-table").innerHTML = filtered.length ? `<table class="data-table"><thead><tr><th>Product</th><th>Category / Variant</th><th>Purchase</th><th>Price</th><th>Stock</th><th>Status</th><th>Actions</th></tr></thead><tbody>${filtered.map(p=>`<tr><td><div class="product-title"><span class="product-thumb">♧</span><div><strong>${safe(p.name)}</strong><small>${safe(p.code||"No code")}</small></div></div></td><td>${safe(p.category||"—")}<br><small>${safe([p.size,p.color].filter(Boolean).join(" / ")||"—")}</small></td><td>${money(p.cost)}</td><td>${money(p.price)}</td><td><strong>${Number(p.stock)}</strong></td><td>${stockStatus(p)}</td><td><div class="row-actions"><button class="small-btn" data-edit-product="${safe(p.id)}">Edit</button><button class="small-btn delete" data-delete-product="${safe(p.id)}">Delete</button></div></td></tr>`).join("")}</tbody></table>` : emptyTable(query ? "No products match your search." : "No products added yet. Select Add product to begin.");
}
function resetProductForm() {
  $("product-form").reset(); $("product-id").value=""; $("product-cost").value="0"; $("product-price").value="0"; $("product-stock").value="0"; $("product-threshold").value="5"; $("product-dialog-title").textContent="Add product";
}
async function editProduct(id) {
  const p = await get("products",id); if (!p) return;
  $("product-id").value=p.id;
  $("product-name").value=p.name||""; $("product-code").value=p.code||""; $("product-category").value=p.category||"";
  $("product-size").value=p.size||""; $("product-color").value=p.color||"";
  $("product-cost").value=p.cost??0; $("product-price").value=p.price??0; $("product-stock").value=p.stock??0; $("product-threshold").value=p.threshold??5;
  $("product-dialog-title").textContent="Edit product"; $("product-dialog").showModal();
}
async function saveProduct(event) {
  event.preventDefault();
  const id = $("product-id").value || uid("prd");
  const product = {
    id,name:$("product-name").value.trim(),code:$("product-code").value.trim(),category:$("product-category").value.trim(),
    size:$("product-size").value.trim(),color:$("product-color").value.trim(),
    cost:Number($("product-cost").value),price:Number($("product-price").value),stock:Number($("product-stock").value),
    threshold:Number($("product-threshold").value||5),updatedAt:new Date().toISOString()
  };
  if (!product.name) return showToast("Enter a product name.");
  if (![product.cost,product.price,product.stock,product.threshold].every(Number.isFinite) || product.cost<0 || product.price<0 || product.stock<0 || product.threshold<0) return showToast("Please enter valid non-negative values.");
  await put("products",product);
  $("product-dialog").close(); resetProductForm(); await refreshAll(); showToast("Product saved.");
}
async function deleteProduct(id) {
  const p=await get("products",id); if(!p) return;
  const sales=await all("sales");
  if(sales.some(s=>s.items?.some(i=>i.productId===id))) {
    if(!confirm(`"${p.name}" appears in past sales. Delete it from current inventory? Past sale records remain.`)) return;
  } else if(!confirm(`Delete "${p.name}"?`)) return;
  await remove("products",id); await refreshAll(); showToast("Product deleted.");
}

async function renderCustomers() {
  const customers=(await all("customers")).sort((a,b)=>a.name.localeCompare(b.name));
  const q=($("customer-search").value||"").trim().toLowerCase();
  const list=customers.filter(c=>[c.name,c.phone,c.email,c.notes].join(" ").toLowerCase().includes(q));
  $("customers-table").innerHTML=list.length?`<table class="data-table"><thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Notes</th><th>Actions</th></tr></thead><tbody>${list.map(c=>`<tr><td>${safe(c.name)}</td><td>${safe(c.phone||"—")}</td><td>${safe(c.email||"—")}</td><td>${safe(c.notes||"—")}</td><td><div class="row-actions"><button class="small-btn" data-edit-customer="${safe(c.id)}">Edit</button><button class="small-btn delete" data-delete-customer="${safe(c.id)}">Delete</button></div></td></tr>`).join("")}</tbody></table>`:emptyTable(q?"No customers match your search.":"No customers saved yet.");
}
function resetCustomerForm(){ $("customer-form").reset(); $("customer-id").value=""; $("customer-dialog-title").textContent="Add customer"; }
async function editCustomer(id){
  const c=await get("customers",id);if(!c)return;
  $("customer-id").value=c.id;$("customer-name").value=c.name||"";$("customer-phone").value=c.phone||"";$("customer-email").value=c.email||"";$("customer-notes").value=c.notes||"";
  $("customer-dialog-title").textContent="Edit customer";$("customer-dialog").showModal();
}
async function saveCustomer(event){
  event.preventDefault();
  const id=$("customer-id").value||uid("cus");
  const customer={id,name:$("customer-name").value.trim(),phone:$("customer-phone").value.trim(),email:$("customer-email").value.trim(),notes:$("customer-notes").value.trim(),updatedAt:new Date().toISOString()};
  if(!customer.name)return showToast("Enter a customer name.");
  await put("customers",customer);$("customer-dialog").close();resetCustomerForm();await refreshAll();showToast("Customer saved.");
}
async function deleteCustomer(id){
  const c=await get("customers",id);if(!c||!confirm(`Delete customer "${c.name}"? Existing sales will keep the saved customer name.`))return;
  await remove("customers",id);await refreshAll();showToast("Customer deleted.");
}
async function updateCustomerOptions(){
  const customers=(await all("customers")).sort((a,b)=>a.name.localeCompare(b.name));
  const select=$("sale-customer");const old=select.value;
  select.innerHTML='<option value="">Walk-in customer</option>'+customers.map(c=>`<option value="${safe(c.id)}">${safe(c.name)}${c.phone?" — "+safe(c.phone):""}</option>`).join("");
  if(customers.some(c=>c.id===old))select.value=old;
}

async function renderSales(){
  const sales=(await all("sales")).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const q=($("sales-search").value||"").trim().toLowerCase();
  const list=sales.filter(s=>[s.invoice,s.customerName,s.payment].join(" ").toLowerCase().includes(q));
  $("sales-table").innerHTML=list.length?`<table class="data-table"><thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th>Items</th><th>Payment</th><th>Total</th><th>Actions</th></tr></thead><tbody>${list.map(s=>`<tr><td>${safe(s.invoice)}</td><td>${safe(dateTime(s.date))}</td><td>${safe(s.customerName||"Walk-in")}</td><td>${s.items.reduce((n,i)=>n+Number(i.qty),0)}</td><td>${safe(s.payment)}</td><td><strong>${money(s.total)}</strong></td><td><button class="small-btn" data-view-sale="${safe(s.id)}">Receipt</button></td></tr>`).join("")}</tbody></table>`:emptyTable(q?"No sales match your search.":"No sales recorded yet.");
}
function newSaleLine(){
  const row=document.createElement("div");row.className="sale-line";
  row.innerHTML=`<label>Product<select class="line-product" required><option value="">Choose product…</option></select></label><label>Qty<input class="line-qty" type="number" min="1" step="1" value="1" required></label><label>Price ₹<input class="line-price" type="number" min="0" step="0.01" value="0" required></label><button type="button" class="remove-line" aria-label="Remove item">×</button>`;
  $("sale-items").appendChild(row);
  row.querySelector(".remove-line").addEventListener("click",()=>{row.remove();updateSaleTotal();});
  row.querySelector(".line-product").addEventListener("change",async e=>{
    const p=await get("products",e.target.value);
    if(p)row.querySelector(".line-price").value=p.price;
    updateSaleTotal();
  });
  row.querySelector(".line-qty").addEventListener("input",updateSaleTotal);
  row.querySelector(".line-price").addEventListener("input",updateSaleTotal);
  fillSaleProductOptions(row.querySelector(".line-product"));
}
async function fillSaleProductOptions(select){
  const products=(await all("products")).sort((a,b)=>a.name.localeCompare(b.name));
  select.innerHTML='<option value="">Choose product…</option>'+products.map(p=>`<option value="${safe(p.id)}" ${p.stock<=0?"disabled":""}>${safe(p.name)}${p.size?" / "+safe(p.size):""}${p.color?" / "+safe(p.color):""} — ${Number(p.stock)} in stock</option>`).join("");
}
function updateSaleTotal(){
  const subtotal=[...document.querySelectorAll(".sale-line")].reduce((sum,row)=>sum+(Number(row.querySelector(".line-qty").value)||0)*(Number(row.querySelector(".line-price").value)||0),0);
  const discount=Math.max(0,Number($("sale-discount").value)||0);
  $("sale-total").textContent=money(Math.max(0,subtotal-discount));
}
async function openNewSale(){
  $("sale-form").reset();$("sale-discount").value="0";$("sale-items").innerHTML="";
  await updateCustomerOptions();newSaleLine();$("sale-dialog").showModal();updateSaleTotal();
}
async function saveSale(event){
  event.preventDefault();
  const rows=[...document.querySelectorAll(".sale-line")];
  if(!rows.length)return showToast("Add at least one item.");
  const items=[];
  for(const row of rows){
    const productId=row.querySelector(".line-product").value;
    const qty=Number(row.querySelector(".line-qty").value);
    const price=Number(row.querySelector(".line-price").value);
    if(!productId||!Number.isInteger(qty)||qty<1||!Number.isFinite(price)||price<0)return showToast("Check the selected products, quantities and prices.");
    const p=await get("products",productId);
    if(!p)return showToast("A selected product no longer exists.");
    if(qty>Number(p.stock))return showToast(`Not enough stock for ${p.name}. Available: ${p.stock}.`);
    items.push({productId:p.id,name:p.name,code:p.code||"",size:p.size||"",color:p.color||"",qty,price,cost:Number(p.cost)||0,lineTotal:qty*price});
  }
  const subtotal=items.reduce((n,i)=>n+i.lineTotal,0);
  const discount=Number($("sale-discount").value)||0;
  if(discount<0||discount>subtotal)return showToast("Discount cannot exceed the subtotal.");
  const customerId=$("sale-customer").value;
  const customer=customerId?await get("customers",customerId):null;
  const sales=await all("sales");
  const invoice=`RCS-${todayKey().replaceAll("-","")}-${String(sales.length+1).padStart(4,"0")}`;
  const sale={id:uid("sale"),invoice,date:new Date().toISOString(),customerId:customer?.id||"",customerName:customer?.name||"Walk-in",items,subtotal,discount,total:subtotal-discount,payment:$("sale-payment").value};
  // Use a single IndexedDB transaction so stock deductions and sale record commit together.
  await new Promise((resolve,reject)=>{
    const tx=db.transaction(["products","sales"],"readwrite");
    const productStore=tx.objectStore("products");
    for(const item of items){
      const req=productStore.get(item.productId);
      req.onsuccess=()=>{
        const p=req.result;
        if(!p||Number(p.stock)<item.qty){tx.abort();return;}
        p.stock=Number(p.stock)-item.qty;
        productStore.put(p);
      };
    }
    tx.objectStore("sales").put(sale);
    tx.oncomplete=resolve;
    tx.onerror=()=>reject(tx.error||new Error("Sale could not be saved."));
    tx.onabort=()=>reject(new Error("Stock changed or is insufficient. Please reopen the sale and try again."));
  }).catch(error=>{throw error;});
  $("sale-dialog").close();await refreshAll();showToast(`Sale ${invoice} saved.`);
}
async function viewSale(id){
  const s=await get("sales",id);if(!s)return;
  currentSaleDetailId=id;$("sale-detail-subtitle").textContent=`${s.invoice} • ${dateTime(s.date)}`;
  $("sale-detail-content").innerHTML=`<div class="receipt-head"><h3>Roshan Cloths Store</h3><div class="muted small">Sales receipt</div><p class="small">Customer: ${safe(s.customerName||"Walk-in")}<br>Payment: ${safe(s.payment)}</p></div>${s.items.map(i=>`<div class="receipt-line"><span>${safe(i.name)}${i.size?" ("+safe(i.size)+")":""}<br><span class="muted">${i.qty} × ${money(i.price)}</span></span><strong>${money(i.lineTotal)}</strong></div>`).join("")}<div class="receipt-line"><span>Subtotal</span><strong>${money(s.subtotal)}</strong></div><div class="receipt-line"><span>Discount</span><strong>− ${money(s.discount)}</strong></div><div class="receipt-line receipt-grand"><span>Total</span><strong>${money(s.total)}</strong></div>`;
  $("sale-detail-dialog").showModal();
}
async function printSale(){
  const s=await get("sales",currentSaleDetailId);if(!s)return;
  const receipt=`<html><head><title>${safe(s.invoice)}</title><style>body{font:14px Arial;max-width:340px;margin:25px auto;color:#111}h2,p{text-align:center}table{width:100%;border-collapse:collapse}td{padding:8px 0;border-bottom:1px dashed #aaa}td:last-child{text-align:right}.total{font-weight:bold;font-size:17px}</style></head><body><h2>Roshan Cloths Store</h2><p>Sales receipt<br>${safe(s.invoice)}<br>${safe(dateTime(s.date))}<br>Customer: ${safe(s.customerName)}</p><table>${s.items.map(i=>`<tr><td>${safe(i.name)}<br>${i.qty} × ${money(i.price)}</td><td>${money(i.lineTotal)}</td></tr>`).join("")}<tr><td>Subtotal</td><td>${money(s.subtotal)}</td></tr><tr><td>Discount</td><td>− ${money(s.discount)}</td></tr><tr class="total"><td>Total</td><td>${money(s.total)}</td></tr></table><p>Thank you for shopping!</p><script>window.onload=()=>window.print()<\/script></body></html>`;
  const w=window.open("","_blank","width=420,height=650");
  if(!w){showToast("Allow pop-ups to print the receipt.");return;}
  w.document.open();w.document.write(receipt);w.document.close();
}
async function renderReports(){
  const [products,sales]=await Promise.all([all("products"),all("sales")]);
  const revenue=sales.reduce((n,s)=>n+Number(s.total||0),0);
  const profit=sales.reduce((n,s)=>n+s.items.reduce((m,i)=>m+(Number(i.price)-Number(i.cost))*Number(i.qty),0)-Number(s.discount||0),0);
  $("report-revenue").textContent=money(revenue);$("report-profit").textContent=money(profit);$("report-count").textContent=sales.length;
  $("report-stock-value").textContent=money(products.reduce((n,p)=>n+Number(p.cost||0)*Number(p.stock||0),0));
  const recent=[...sales].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,10);
  $("report-sales-table").innerHTML=recent.length?`<table class="data-table"><thead><tr><th>Date</th><th>Invoice</th><th>Customer</th><th>Units</th><th>Sales</th></tr></thead><tbody>${recent.map(s=>`<tr><td>${safe(new Date(s.date).toLocaleDateString("en-IN"))}</td><td>${safe(s.invoice)}</td><td>${safe(s.customerName)}</td><td>${s.items.reduce((n,i)=>n+Number(i.qty),0)}</td><td>${money(s.total)}</td></tr>`).join("")}</tbody></table>`:emptyTable("Your sales report will appear here.");
}
function downloadFile(name,content,type){
  const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function exportBackup(){
  const data={app:"Roshan Cloths Store",version:1,exportedAt:new Date().toISOString(),products:await all("products"),customers:await all("customers"),sales:await all("sales")};
  downloadFile(`roshan-store-backup-${todayKey()}.json`,JSON.stringify(data,null,2),"application/json");
  showToast("Backup downloaded. Keep it safe.");
}
async function restoreBackup(){
  const file=$("restore-file").files[0];if(!file)return showToast("Choose a JSON backup file first.");
  let data;
  try{data=JSON.parse(await file.text());}catch{return showToast("That file is not valid JSON.");}
  if(!data||!Array.isArray(data.products)||!Array.isArray(data.customers)||!Array.isArray(data.sales))return showToast("Backup format not recognized.");
  if(!confirm("Restore this backup? It will replace all current products, customers and sales."))return;
  const valid=(arr,fields)=>arr.every(item=>item&&typeof item.id==="string"&&fields.every(f=>f in item));
  if(!valid(data.products,["name","price","cost","stock"])||!valid(data.customers,["name"])||!valid(data.sales,["invoice","date","items","total"]))return showToast("Backup contains incomplete records.");
  await new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE_NAMES,"readwrite");
    for(const name of STORE_NAMES){
      const store=tx.objectStore(name);store.clear();
      for(const item of data[name])store.put(item);
    }
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
  });
  $("restore-file").value="";await refreshAll();showToast("Backup restored.");
}
async function exportSalesCSV(){
  const sales=(await all("sales")).sort((a,b)=>new Date(a.date)-new Date(b.date));
  const rows=[["Invoice","Date","Customer","Product","Code","Size","Color","Quantity","Unit Price","Line Total","Discount","Sale Total","Payment"]];
  sales.forEach(s=>s.items.forEach(i=>rows.push([s.invoice,s.date,s.customerName,i.name,i.code,i.size,i.color,i.qty,i.price,i.lineTotal,s.discount,s.total,s.payment])));
  const csv=rows.map(row=>row.map(value=>`"${String(value??"").replaceAll('"','""')}"`).join(",")).join("\r\n");
  downloadFile(`roshan-sales-${todayKey()}.csv`,csv,"text/csv;charset=utf-8");
  showToast("Sales CSV downloaded.");
}
async function exportReportCSV(){await exportSalesCSV();}
async function clearAllData(){
  if(!confirm("Delete ALL products, customers and sales from this device? This cannot be undone unless you have a backup."))return;
  if(!confirm("Final confirmation: permanently clear all store data?"))return;
  await Promise.all(STORE_NAMES.map(clearStore));await refreshAll();showToast("All local store data cleared.");
}
async function renderStorageStatus(){
  const [p,c,s]=await Promise.all([all("products"),all("customers"),all("sales")]);
  $("storage-status").textContent=`Currently saved on this device: ${p.length} products, ${c.length} customers and ${s.length} sales.`;
}

function setupEvents(){
  document.querySelectorAll("[data-page]").forEach(el=>el.addEventListener("click",()=>setPage(el.dataset.page)));
  document.querySelectorAll("[data-go]").forEach(el=>el.addEventListener("click",()=>setPage(el.dataset.go)));
  $("mobile-menu").addEventListener("click",()=>document.body.classList.toggle("mobile-menu-open"));
  $("add-product-btn").addEventListener("click",()=>{resetProductForm();$("product-dialog").showModal();});
  $("product-form").addEventListener("submit",e=>saveProduct(e).catch(err=>showToast(err.message||"Could not save product.")));
  $("products-table").addEventListener("click",e=>{
    const edit=e.target.closest("[data-edit-product]"),del=e.target.closest("[data-delete-product]");
    if(edit)editProduct(edit.dataset.editProduct).catch(err=>showToast(err.message));
    if(del)deleteProduct(del.dataset.deleteProduct).catch(err=>showToast(err.message));
  });
  $("product-search").addEventListener("input",renderProducts);
  $("stock-filter").addEventListener("change",renderProducts);
  $("add-customer-btn").addEventListener("click",()=>{resetCustomerForm();$("customer-dialog").showModal();});
  $("customer-form").addEventListener("submit",e=>saveCustomer(e).catch(err=>showToast(err.message||"Could not save customer.")));
  $("customers-table").addEventListener("click",e=>{
    const edit=e.target.closest("[data-edit-customer]"),del=e.target.closest("[data-delete-customer]");
    if(edit)editCustomer(edit.dataset.editCustomer).catch(err=>showToast(err.message));
    if(del)deleteCustomer(del.dataset.deleteCustomer).catch(err=>showToast(err.message));
  });
  $("customer-search").addEventListener("input",renderCustomers);
  $("new-sale-btn").addEventListener("click",()=>openNewSale().catch(err=>showToast(err.message)));
  $("sale-form").addEventListener("submit",e=>saveSale(e).catch(err=>showToast(err.message||"Could not save sale.")));
  $("add-sale-line").addEventListener("click",newSaleLine);
  $("sale-discount").addEventListener("input",updateSaleTotal);
  $("sales-search").addEventListener("input",renderSales);
  $("sales-table").addEventListener("click",e=>{const btn=e.target.closest("[data-view-sale]");if(btn)viewSale(btn.dataset.viewSale).catch(err=>showToast(err.message));});
  $("print-sale-btn").addEventListener("click",printSale);
  $("backup-btn").addEventListener("click",()=>exportBackup().catch(err=>showToast(err.message)));
  $("restore-btn").addEventListener("click",()=>restoreBackup().catch(err=>showToast(err.message||"Could not restore backup.")));
  $("backup-csv-btn").addEventListener("click",()=>exportSalesCSV().catch(err=>showToast(err.message)));
  $("export-report-btn").addEventListener("click",()=>exportReportCSV().catch(err=>showToast(err.message)));
  $("clear-data-btn").addEventListener("click",()=>clearAllData().catch(err=>showToast(err.message)));
  document.querySelectorAll("[data-close]").forEach(btn=>btn.addEventListener("click",()=>$(btn.dataset.close).close()));
  ["product-dialog","customer-dialog","sale-dialog","sale-detail-dialog"].forEach(id=>$(id).addEventListener("click",e=>{if(e.target===$(id))$(id).close();}));
}
async function init(){
  $("today-label").textContent=new Date().toLocaleDateString("en-IN",{weekday:"short",day:"numeric",month:"short",year:"numeric"});
  setupEvents();
  try{
    db=await openDB();
    await refreshAll();
    if("serviceWorker" in navigator && (location.protocol==="https:"||location.hostname==="localhost"||location.hostname==="127.0.0.1")){
      navigator.serviceWorker.register("./sw.js").catch(err=>console.warn("Service worker unavailable:",err));
    }
  }catch(error){
    document.querySelector("main").insertAdjacentHTML("afterbegin",`<div class="panel" style="padding:18px;color:#991b1b">Local database could not start: ${safe(error.message)}. Please open this app in Safari or a modern browser from localhost/HTTPS.</div>`);
  }
}
document.addEventListener("DOMContentLoaded",init);
})();