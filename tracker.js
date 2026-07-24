'use strict';

const POLL_MS = 5000;
const ANIMATION_MS = 250; // Four smooth screen updates per second.
const FREE_FAVOURITE_LIMIT = 5;
const FREE_SAVED_LIMIT = 10;
const els = Object.fromEntries(['backBtn','refreshBtn','topArBtn','searchInput','clearSearch','locateBtn','favouritesBtn','savedBtn','favouriteCount','savedCount','statusText','aircraftCount','listToggle','listCount','aircraftList','detailsPanel','closeDetails','aircraftPhoto','detailStatus','detailCallsign','detailReg','detailType','detailDistance','detailAltitude','detailSpeed','detailHeading','detailSeen','centreAircraft','openAr','saveFavourite','saveItem','liveDot','navNearby','navA7','navAr','navHome'].map(id=>[id,document.getElementById(id)]));

const state={map:null,user:null,aircraft:[],markers:new Map(),userMarker:null,selected:null,pollTimer:null,animationTimer:null,photoCache:new Map(),loading:false,filter:'all',lastRequestCentre:null,favourites:readStore('aviquest_favourites'),saved:readStore('aviquest_saved')};

function initialiseMap(){
  state.map=L.map('map',{zoomControl:true,preferCanvas:true,worldCopyJump:true,minZoom:2}).setView([-25,134],4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© OpenStreetMap contributors'}).addTo(state.map);
  state.map.on('moveend zoomend',debounce(()=>loadVisibleAircraft(false),450));
}

function readStore(key){try{return JSON.parse(localStorage.getItem(key)||'[]')}catch{return[]}}
function writeStore(key,value){localStorage.setItem(key,JSON.stringify(value));updateSavedCounts()}
function updateSavedCounts(){els.favouriteCount.textContent=state.favourites.length;els.savedCount.textContent=state.saved.length}
function itemIdentity(a){return clean(a.registration)||clean(a.hex)||clean(a.callsign)}

function getLocation(recentre=true){
  if(!navigator.geolocation)return setStatus('Location is not supported on this device.',false);
  setStatus('Finding your location…',false);
  navigator.geolocation.getCurrentPosition(p=>{
    state.user={lat:p.coords.latitude,lon:p.coords.longitude};drawUser(recentre);loadVisibleAircraft(true);
  },e=>setStatus(e.code===1?'Location permission is needed for My location.':'Could not get your location.',false),{enableHighAccuracy:true,timeout:12000,maximumAge:15000});
}

function drawUser(recentre){
  if(!state.user)return;
  const icon=L.divIcon({className:'',html:'<div class="user-pin"></div>',iconSize:[20,20],iconAnchor:[10,10]});
  if(!state.userMarker)state.userMarker=L.marker([state.user.lat,state.user.lon],{icon,zIndexOffset:1000}).addTo(state.map).bindTooltip('Your location');
  else state.userMarker.setLatLng([state.user.lat,state.user.lon]);
  if(recentre)state.map.flyTo([state.user.lat,state.user.lon],8);
}

function requestGeometry(){
  const c=state.map.getCenter(),b=state.map.getBounds();
  const edge=haversineKm(c.lat,c.lng,b.getNorth(),b.getEast());
  return{lat:c.lat,lon:c.lng,radiusNm:Math.max(10,Math.min(250,Math.ceil(edge/1.852*1.15)))};
}

async function loadVisibleAircraft(force=false){
  if(state.loading)return;
  const g=requestGeometry();
  if(!force&&state.lastRequestCentre&&haversineKm(g.lat,g.lon,state.lastRequestCentre.lat,state.lastRequestCentre.lon)<4&&g.radiusNm===state.lastRequestCentre.radiusNm)return;
  state.loading=true;state.lastRequestCentre=g;setStatus('Updating the visible map area…',false);
  try{
    const url=`/.netlify/functions/nearby-aircraft?lat=${g.lat.toFixed(5)}&lon=${g.lon.toFixed(5)}&radius=${g.radiusNm}&_=${Date.now()}`;
    const response=await fetch(url,{cache:'no-store'}),data=await response.json();
    if(!response.ok)throw new Error(data.error||'Live aircraft request failed');
    const now=Date.now();
    state.aircraft=(data.aircraft||[]).map(a=>enrichAircraft(a,now)).sort((a,b)=>a.distanceKm-b.distanceKm);
    renderMarkers();renderList();
    const stamp=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    setStatus(`${data.source||'Live'} • ${stamp}`,true);
    els.aircraftCount.textContent=`${state.aircraft.length} aircraft`;els.listCount.textContent=filteredAircraft().length;
    if(state.selected){const updated=state.aircraft.find(a=>aircraftKey(a)===aircraftKey(state.selected));if(updated)selectAircraft(updated,false)}
  }catch(error){setStatus(error.message||'Unable to load aircraft.',false)}finally{state.loading=false}
}

function enrichAircraft(a,now){
  const distanceKm=state.user?haversineKm(state.user.lat,state.user.lon,a.lat,a.lon):null;
  const old=state.aircraft.find(x=>aircraftKey(x)===aircraftKey(a));
  return{...a,distanceKm,displayName:clean(a.callsign)||clean(a.registration)||clean(a.hex).toUpperCase()||'Unknown aircraft',fromLat:old?.renderLat??old?.lat??a.lat,fromLon:old?.renderLon??old?.lon??a.lon,toLat:a.lat,toLon:a.lon,renderLat:old?.renderLat??a.lat,renderLon:old?.renderLon??a.lon,transitionStart:now};
}

function animateMarkers(){
  const now=Date.now(),duration=Math.max(POLL_MS,1000);
  for(const a of state.aircraft){
    const t=Math.min(1,(now-a.transitionStart)/duration);a.renderLat=a.fromLat+(a.toLat-a.fromLat)*t;a.renderLon=a.fromLon+(a.toLon-a.fromLon)*t;
    const marker=state.markers.get(aircraftKey(a));if(marker)marker.setLatLng([a.renderLat,a.renderLon]);
  }
}

function renderMarkers(){
  const active=new Set();
  state.aircraft.forEach(a=>{
    const key=aircraftKey(a);active.add(key);const selected=state.selected&&aircraftKey(state.selected)===key;const icon=aircraftIcon(a,selected);let marker=state.markers.get(key);
    if(!marker){marker=L.marker([a.renderLat,a.renderLon],{icon,riseOnHover:true}).addTo(state.map);state.markers.set(key,marker)}else marker.setIcon(icon);
    marker.off('click').on('click',()=>selectAircraft(a));marker.bindTooltip(`${escapeHtml(a.displayName)}<br>${a.distanceKm===null?'Visible map area':formatDistance(a.distanceKm)}`,{direction:'top',offset:[0,-14]});
  });
  for(const[key,marker]of state.markers)if(!active.has(key)){state.map.removeLayer(marker);state.markers.delete(key)}
}

function aircraftIcon(a,selected){const ground=Number(a.altitude)===0,rotation=Number.isFinite(Number(a.track))?Number(a.track):0;return L.divIcon({className:'aircraft-icon',iconSize:[31,31],iconAnchor:[15,15],html:`<div class="plane-marker${ground?' ground':''}${selected?' selected':''}" style="transform:rotate(${rotation}deg)">✈</div>`})}

function filteredAircraft(){
  let list=state.aircraft,q=els.searchInput.value.trim().toLowerCase();
  if(state.filter==='favourites')list=list.filter(a=>state.favourites.includes(itemIdentity(a)));
  if(state.filter==='saved')list=list.filter(a=>state.saved.some(x=>x.id===itemIdentity(a)));
  if(q)list=list.filter(a=>[a.callsign,a.registration,a.hex,a.type,a.description,a.category].some(v=>clean(v).toLowerCase().includes(q)));
  return list;
}

function renderList(){
  const list=filteredAircraft();els.listCount.textContent=list.length;
  if(!list.length){els.aircraftList.innerHTML='<div class="empty-list">No matching aircraft are loaded in the visible map area. Pan or zoom the map to search another region.</div>';return}
  els.aircraftList.innerHTML='';list.slice(0,150).forEach(a=>{const b=document.createElement('button');b.type='button';b.className='aircraft-row';b.innerHTML=`<img src="images/aircraft-placeholder.svg" alt=""><div><strong>${escapeHtml(a.displayName)}</strong><small>${escapeHtml(clean(a.registration)||clean(a.type)||'Live aircraft')}</small></div><span class="distance">${a.distanceKm===null?'On map':formatDistance(a.distanceKm)}</span>`;b.addEventListener('click',()=>selectAircraft(a));els.aircraftList.appendChild(b);loadPhoto(a).then(p=>{if(p?.thumbnail)b.querySelector('img').src=p.thumbnail})})
}

async function selectAircraft(a,open=true){state.selected=a;renderMarkers();els.detailCallsign.textContent=a.displayName;els.detailReg.textContent=clean(a.registration)||clean(a.hex).toUpperCase()||'Registration unavailable';els.detailType.textContent=clean(a.description)||clean(a.type)||'Unknown';els.detailDistance.textContent=a.distanceKm===null?'Outside your location range':formatDistance(a.distanceKm);els.detailAltitude.textContent=formatAltitude(a.altitude);els.detailSpeed.textContent=formatSpeed(a.speed);els.detailHeading.textContent=formatHeading(a.track);els.detailSeen.textContent=formatSeen(a.seenPosition??a.seen);els.aircraftPhoto.src='images/aircraft-placeholder.svg';updateSaveButtons();if(open){els.detailsPanel.classList.remove('hidden');els.aircraftList.classList.remove('open')}const p=await loadPhoto(a);if(state.selected&&aircraftKey(state.selected)===aircraftKey(a)&&p?.image)els.aircraftPhoto.src=p.image}

async function loadPhoto(a){const key=clean(a.registration)||clean(a.hex);if(!key)return null;if(state.photoCache.has(key))return state.photoCache.get(key);const promise=fetch(`/.netlify/functions/aircraft-photo?registration=${encodeURIComponent(clean(a.registration))}&hex=${encodeURIComponent(clean(a.hex))}`).then(r=>r.ok?r.json():null).catch(()=>null);state.photoCache.set(key,promise);return promise}

function toggleFavourite(){if(!state.selected)return;const id=itemIdentity(state.selected),i=state.favourites.indexOf(id);if(i>=0)state.favourites.splice(i,1);else{if(state.favourites.length>=FREE_FAVOURITE_LIMIT)return setStatus(`Free accounts can save ${FREE_FAVOURITE_LIMIT} favourites.`,false);state.favourites.push(id)}writeStore('aviquest_favourites',state.favourites);updateSaveButtons();renderList()}
function toggleSaved(){if(!state.selected)return;const id=itemIdentity(state.selected),i=state.saved.findIndex(x=>x.id===id);if(i>=0)state.saved.splice(i,1);else{if(state.saved.length>=FREE_SAVED_LIMIT)return setStatus(`Free accounts can save ${FREE_SAVED_LIMIT} items.`,false);state.saved.push({id,name:state.selected.displayName,registration:clean(state.selected.registration),type:clean(state.selected.type)})}writeStore('aviquest_saved',state.saved);updateSaveButtons();renderList()}
function updateSaveButtons(){if(!state.selected)return;const id=itemIdentity(state.selected);els.saveFavourite.textContent=state.favourites.includes(id)?'★ Favourited':'☆ Favourite';els.saveItem.textContent=state.saved.some(x=>x.id===id)?'▣ Saved':'▣ Save aircraft'}
function setFilter(filter){state.filter=state.filter===filter?'all':filter;els.favouritesBtn.classList.toggle('active',state.filter==='favourites');els.savedBtn.classList.toggle('active',state.filter==='saved');renderList();els.aircraftList.classList.add('open')}
function searchA7(){els.searchInput.value='A7-BAF';state.filter='all';renderList();els.aircraftList.classList.add('open');const a7=state.aircraft.find(a=>clean(a.registration).toUpperCase()==='A7-BAF');if(a7){selectAircraft(a7);state.map.flyTo([a7.lat,a7.lon],8)}else setStatus('A7-BAF is not in the currently loaded map area. Pan to its region or connect a global registration API.',false)}
function openAr(){const id=state.selected?itemIdentity(state.selected):'';location.href=`ar.html${id?`?aircraft=${encodeURIComponent(id)}`:''}`}
function setStatus(text,live){els.statusText.textContent=text;els.liveDot.classList.toggle('live',!!live)}
function aircraftKey(a){return clean(a.hex)||clean(a.registration)||`${a.lat},${a.lon},${a.callsign}`}
function clean(v){return String(v??'').trim()}
function haversineKm(lat1,lon1,lat2,lon2){const r=6371,toRad=x=>x*Math.PI/180,dLat=toRad(lat2-lat1),dLon=toRad(lon2-lon1),h=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;return 2*r*Math.asin(Math.sqrt(h))}
function formatDistance(km){return km<1?`${Math.round(km*1000)} m`:`${km<10?km.toFixed(1):Math.round(km)} km`}
function formatAltitude(ft){if(!Number.isFinite(Number(ft)))return'Unknown';if(Number(ft)===0)return'Ground';return`${Math.round(Number(ft)).toLocaleString()} ft`}
function formatSpeed(kts){return Number.isFinite(Number(kts))?`${Math.round(Number(kts))} kt`:'Unknown'}
function formatHeading(deg){if(!Number.isFinite(Number(deg)))return'Unknown';const d=((Number(deg)%360)+360)%360,dirs=['N','NE','E','SE','S','SW','W','NW'];return`${Math.round(d)}° ${dirs[Math.round(d/45)%8]}`}
function formatSeen(sec){return Number.isFinite(Number(sec))?Number(sec)<2?'Just now':`${Math.round(Number(sec))} sec ago`:'Live'}
function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function debounce(fn,ms){let t;return(...args)=>{clearTimeout(t);t=setTimeout(()=>fn(...args),ms)}}

els.backBtn.addEventListener('click',()=>location.href='index.html');els.navHome.addEventListener('click',()=>location.href='index.html');els.topArBtn.addEventListener('click',openAr);els.navAr.addEventListener('click',openAr);els.openAr.addEventListener('click',openAr);els.refreshBtn.addEventListener('click',()=>loadVisibleAircraft(true));els.locateBtn.addEventListener('click',()=>getLocation(true));els.searchInput.addEventListener('input',renderList);els.searchInput.addEventListener('focus',()=>els.aircraftList.classList.add('open'));els.clearSearch.addEventListener('click',()=>{els.searchInput.value='';renderList()});els.listToggle.addEventListener('click',()=>els.aircraftList.classList.toggle('open'));els.closeDetails.addEventListener('click',()=>{state.selected=null;els.detailsPanel.classList.add('hidden');renderMarkers()});els.centreAircraft.addEventListener('click',()=>{if(state.selected)state.map.flyTo([state.selected.lat,state.selected.lon],10)});els.saveFavourite.addEventListener('click',toggleFavourite);els.saveItem.addEventListener('click',toggleSaved);els.favouritesBtn.addEventListener('click',()=>setFilter('favourites'));els.savedBtn.addEventListener('click',()=>setFilter('saved'));els.navA7.addEventListener('click',searchA7);els.navNearby.addEventListener('click',()=>{state.filter='all';els.searchInput.value='';renderList();els.aircraftList.classList.add('open')});

initialiseMap();updateSavedCounts();loadVisibleAircraft(true);getLocation(false);state.pollTimer=setInterval(()=>loadVisibleAircraft(true),POLL_MS);state.animationTimer=setInterval(animateMarkers,ANIMATION_MS);document.addEventListener('visibilitychange',()=>{if(!document.hidden)loadVisibleAircraft(true)});
