/* ARC application logic: Supabase Auth + database + gallery. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const client = () => window.arcSupabase;
  const DEFAULT_EDITION = {editionNum:'5',editionTag:'#Week5',reportingTime:'5:30 AM',startTime:'5:50 AM',venueName:'Habitat Centre (हैबिटेट सेंटर)',venueSub:'Near University Circle / Lal Diggi, Aligarh',routeDesc:'5 KM Circle Loop (Spot par announce hoga)'};
  let role='pending', runners=[], photos=[], edition={...DEFAULT_EDITION};
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function notify(title,message){let box=$('arcNotice');if(!box){box=document.createElement('div');box.id='arcNotice';box.className='fixed bottom-5 left-1/2 -translate-x-1/2 z-[100] rounded-xl bg-slate-900 border border-slate-700 px-5 py-3 text-sm text-white shadow-xl';document.body.appendChild(box);}box.textContent=title+': '+message;box.classList.remove('hidden');setTimeout(()=>box.classList.add('hidden'),4000);}
  function ready(){if(!client()){notify('Setup needed','supabase.js में Publishable Key डालें और page reload करें।');return false;}return true;}
  async function getRole(){const {data:{user}}=await client().auth.getUser();if(!user){role='pending';return null;}const {data,error}=await client().from('arc_profiles').select('role').eq('user_id',user.id).maybeSingle();if(error)throw error;role=data?.role||'pending';return user;}
  function applyEdition(){const c=edition;const set=(id,v)=>{if($(id))$(id).textContent=v;};set('hero-edition-tag',`Upcoming Edition ${c.editionTag}`);set('hero-edition-badge',`#${c.editionNum}`);set('hero-edition-title',`Aligarh Sunday Run #${c.editionNum}`);set('hero-venue-name',c.venueName);set('hero-venue-sub',c.venueSub||'Aligarh');set('hero-schedule-desc',`${c.reportingTime} Reporting & Warm-Up • ${c.startTime} Run Start`);set('hero-display-reporting',c.reportingTime);set('hero-display-start',c.startTime);set('hero-route-desc',c.routeDesc||'5 KM Run');}
  async function loadEdition(){const {data,error}=await client().from('arc_settings').select('setting_value').eq('setting_key','edition').maybeSingle();if(error)throw error;if(data?.setting_value)edition={...DEFAULT_EDITION,...data.setting_value};applyEdition();}
  
  async function loadStats(){
    const {data, error} = await client().from('arc_registrations').select('age, gender');
    if (error) {
      console.error('Stats load error:', error);
      return;
    }
    const list = data || [];
    let total = list.length;
    let male = 0, female = 0;
    let u18 = 0, a18_25 = 0, a26_40 = 0, a40plus = 0;

    list.forEach(r => {
      if (r.gender === 'Male') male++;
      else if (r.gender === 'Female') female++;

      const age = Number(r.age);
      if (age < 18) u18++;
      else if (age >= 18 && age <= 25) a18_25++;
      else if (age >= 26 && age <= 40) a26_40++;
      else if (age > 40) a40plus++;
    });

    const set = (id, v) => { if($(id)) $(id).textContent = String(v ?? 0); };
    set('stat-total', total);
    set('stat-male', male);
    set('stat-female', female);
    set('stat-age-under18', u18);
    set('stat-age-18-25', a18_25);
    set('stat-age-26-40', a26_40);
    set('stat-age-40plus', a40plus);
    set('hero-roster-count', `${total} Runners Registered`);
  }

  async function handleRegistration(e){e.preventDefault();if(!ready())return;const name=$('fullName')?.value.trim(),phone=$('whatsapp')?.value.replace(/\D/g,''),age=Number($('age')?.value),gender=$('gender')?.value,category=$('distanceCategory')?.value||'5K Run',area=$('locationArea')?.value.trim()||'Aligarh';if(!name||phone?.length<10||phone.length>15||!Number.isInteger(age)||age<5||age>100||!gender){notify('Check details','कृपया सही नाम, 10–15 अंकों का फोन, उम्र और gender भरें।');return;}const btn=e.submitter;if(btn)btn.disabled=true;const {error}=await client().from('arc_registrations').insert({name,phone,age,gender,category,area});if(btn)btn.disabled=false;if(error){notify(error.code==='23505'?'Already registered':'Registration failed',error.code==='23505'?'यह मोबाइल नंबर पहले से registered है।':error.message);return;}e.target.reset();notify('Success','आपका ARC registration हो गया।');await loadStats();if($('registrationSuccessModal'))$('registrationSuccessModal').classList.remove('hidden');}
  async function openAuthModal(){if(!ready())return;let modal=$('arcAuthModal');if(!modal){modal=document.createElement('div');modal.id='arcAuthModal';modal.className='fixed inset-0 z-[90] bg-black/80 flex items-center justify-center p-4';modal.innerHTML=`<div class="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 text-white"><div class="flex justify-between mb-4"><h2 class="text-xl font-bold">ARC Organizer Login</h2><button id="arcAuthClose" class="text-2xl">×</button></div><form id="arcAuthForm" class="space-y-3"><input id="arcAuthEmail" type="email" required placeholder="Email" class="w-full rounded-lg bg-slate-800 p-3"><input id="arcAuthPassword" type="password" required minlength="8" placeholder="Password" class="w-full rounded-lg bg-slate-800 p-3"><button class="w-full rounded-lg bg-emerald-500 p-3 font-bold text-black">Sign in</button></form><p class="mt-3 text-xs text-slate-400">केवल Admin द्वारा approved Organizer accounts को access मिलेगा।</p></div>`;document.body.appendChild(modal);$('arcAuthClose').onclick=()=>modal.remove();$('arcAuthForm').onsubmit=async ev=>{ev.preventDefault();const {error}=await client().auth.signInWithPassword({email:$('arcAuthEmail').value.trim(),password:$('arcAuthPassword').value});if(error){notify('Login failed',error.message);return;}modal.remove();await refreshAdmin();};}}
  async function refreshAdmin(){try{const user=await getRole();if(!user){notify('Signed out','');return;}if(!['admin','organizer'].includes(role)){await client().auth.signOut();notify('Access pending','Admin approval के बाद login मिलेगा।');return;}await loadRunners();notify('Welcome',`Signed in as ${role}`);if($('rosterModal'))$('rosterModal').classList.remove('hidden');}catch(e){notify('Error',e.message);}}
  async function loadRunners(){const {data,error}=await client().from('arc_registrations').select('id,name,phone,age,gender,category,area,registered_at').order('registered_at',{ascending:false});if(error)throw error;runners=data||[];renderRoster();}
  function renderRoster(){const host=$('rosterListContainer');if(!host)return;host.innerHTML=runners.map(r=>`<div class="flex flex-wrap justify-between gap-2 py-3 border-b border-slate-800 text-sm"><div><b>${esc(r.name)}</b><div class="text-xs text-slate-400">${esc(r.gender)} • ${esc(r.age)} • ${esc(r.area)}</div></div><div class="text-right"><div>${esc(r.phone)}</div><button class="text-red-400 text-xs" data-delete-runner="${esc(r.id)}">Delete</button></div></div>`).join('')||'<p class="text-slate-400 p-4">No registrations found.</p>';host.querySelectorAll('[data-delete-runner]').forEach(b=>b.onclick=()=>deleteRunner(b.dataset.deleteRunner));}
  async function deleteRunner(id){if(role!=='admin'||!confirm('Delete this registration?'))return;const {error}=await client().from('arc_registrations').delete().eq('id',id);if(error){notify('Delete failed',error.message);return;}await loadRunners();await loadStats();}
  async function loadGallery(){const {data,error}=await client().from('arc_gallery').select('*').order('created_at',{ascending:false});if(error)throw error;photos=data||[];renderGallery();}
  function renderGallery(){const host=$('galleryGrid');if(!host)return;host.innerHTML=photos.map(p=>`<figure class="overflow-hidden rounded-xl border border-slate-800 bg-slate-900"><img loading="lazy" src="${client().storage.from('arc-gallery').getPublicUrl(p.image_path).data.publicUrl}" alt="${esc(p.caption)}" class="w-full aspect-[4/3] object-cover"><figcaption class="p-3 text-sm text-slate-200">${esc(p.caption)}</figcaption></figure>`).join('')||'<p class="text-slate-400">Gallery photos will appear here.</p>';}
  async function handleOrganizerPhotoUpload(){if(!['admin','organizer'].includes(role)){notify('Login required','Organizer login करें।');return;}const file=$('photoFileInput')?.files?.[0];if(!file||!file.type.startsWith('image/')||file.size>8*1024*1024){notify('Choose image','8 MB तक की image चुनें।');return;}const path=`${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;const up=await client().storage.from('arc-gallery').upload(path,file,{upsert:false,contentType:file.type});if(up.error){notify('Upload failed',up.error.message);return;}const {error}=await client().from('arc_gallery').insert({image_path:path,caption:$('photoCaptionInput')?.value.trim()||'',edition:edition.editionTag});if(error){await client().storage.from('arc-gallery').remove([path]);notify('Save failed',error.message);return;}if($('photoFileInput'))$('photoFileInput').value='';if($('photoCaptionInput'))$('photoCaptionInput').value='';await loadGallery();notify('Uploaded','Photo gallery में जोड़ दी गई।');}
  async function handleSaveEditionSettings(e){e.preventDefault();if(!['admin','organizer'].includes(role)){notify('Login required','Organizer login करें।');return;}edition={editionNum:$('cfgEditionNum').value.trim(),editionTag:$('cfgEditionTag').value.trim(),reportingTime:$('cfgReportingTime').value.trim(),startTime:$('cfgStartTime').value.trim(),venueName:$('cfgVenueName').value.trim(),venueSub:'Aligarh',routeDesc:'5 KM Circle Loop'};const {error}=await client().from('arc_settings').upsert({setting_key:'edition',setting_value:edition,updated_at:new Date().toISOString()});if(error){notify('Save failed',error.message);return;}applyEdition();notify('Updated','Edition settings सभी visitors के लिए update हो गईं।');}
  function switchOrganizerTab(tab){['runners','photos','edition'].forEach(k=>{const el=$('orgTab'+k[0].toUpperCase()+k.slice(1));if(el)el.classList.toggle('hidden',k!==tab);});}
  async function logout(){await client().auth.signOut();role='pending';notify('Signed out','');}
  function toggleRosterModal(){const el=$('rosterModal');if(!el)return;if(el.classList.contains('hidden')){openAuthModal();}else{el.classList.add('hidden');}}
  function closePinModal(){/* Legacy PIN modal removed; authentication is email/password only. */}
  async function advanceToNextEdition(){if(role!=='admin'&&role!=='organizer'){notify('Login required','Organizer login करें।');return;}const n=Number(edition.editionNum)||0;edition.editionNum=String(n+1);edition.editionTag=`#Week${n+1}`;applyEdition();const {error}=await client().from('arc_settings').upsert({setting_key:'edition',setting_value:edition,updated_at:new Date().toISOString()});if(error){notify('Save failed',error.message);return;}notify('Edition updated',`अब Edition ${edition.editionNum} है।`);}
  window.openAuthModal=openAuthModal;window.handleRegistration=handleRegistration;window.handleOrganizerPhotoUpload=handleOrganizerPhotoUpload;window.handleSaveEditionSettings=handleSaveEditionSettings;window.switchOrganizerTab=switchOrganizerTab;window.arcLogout=logout;window.toggleRosterModal=toggleRosterModal;window.closePinModal=closePinModal;window.advanceToNextEdition=advanceToNextEdition;
  window.addEventListener('DOMContentLoaded',async()=>{if(!client()){console.warn('ARC Supabase not configured');return;}if($('registrationForm'))$('registrationForm').addEventListener('submit',handleRegistration);try{await Promise.all([loadStats(),loadEdition(),loadGallery()]);}catch(e){console.error(e);notify('Connection issue',e.message);}client().auth.onAuthStateChange((_event)=>{refreshAdmin().catch(console.error);});});
})();
