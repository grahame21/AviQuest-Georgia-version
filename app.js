(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const views = [...document.querySelectorAll('.view')];
  const K = {
    profile: 'aqg_profile',
    progress: 'aqg_progress',
    spots: 'aqg_spots',
    ideas: 'aqg_ideas',
    favourites: 'aqg_favs',
    heroPhoto: 'aqg_hero_photo'
  };

  const freshProfile = () => ({name:'Georgia',sound:true,haptics:true,large:false,reduced:false,count:10});
  const freshProgress = () => ({level:1,xp:0,dailyStreak:0,lastDaily:'',totalCorrect:0,totalAnswered:0,bestStreak:0,recent:[],categoryWins:{}});
  const freshFavourites = () => ({aircraft:['A7-BAF'],airlines:['Qatar Airways'],airports:['Doha Hamad']});

  const load = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? structuredClone(fallback); }
    catch { return structuredClone(fallback); }
  };
  const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));

  let profile = load(K.profile, freshProfile());
  let progress = {...freshProgress(), ...load(K.progress, freshProgress())};
  let spots = load(K.spots, []);
  let arSpots = load('ggAdventureArSpots', []);
  let ideas = load(K.ideas, []);
  let favs = load(K.favourites, freshFavourites());
  let heroPhoto = localStorage.getItem(K.heroPhoto) || '';
  let quiz = null;
  let tab = 'aircraft';

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const unique = items => [...new Set(items)];
  const shuffle = (items, random = Math.random) => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };
  const distractors = (items, correct, count, random) => shuffle(unique(items.filter(item => item && item !== correct)), random).slice(0, count);
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };
  const seeded = seed => {
    let h = 2166136261;
    for (const char of seed) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
    return () => {
      h += 0x6D2B79F5;
      let t = h;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  function show(id) {
    views.forEach(view => view.classList.toggle('active', view.id === id));
    if (id === 'home') refreshHome();
    if (id === 'spotter') { renderArSpots(); renderSpots(); }
    if (id === 'hangar') renderHangar();
    if (id === 'achievements') renderAchievements();
    if (id === 'ideas') renderIdeas();
    window.scrollTo({top:0, behavior:profile.reduced ? 'auto' : 'smooth'});
  }

  function refreshHome() {
    $('hello').textContent = profile.name;
    $('level').textContent = progress.level;
    $('xp').textContent = progress.xp.toLocaleString();
    $('dailyStreak').textContent = progress.dailyStreak;
    $('spotted').textContent = spots.length;
  }

  function difficultyRank(value) { return {easy:0,medium:1,hard:2}[value] ?? 0; }
  function harder(base, minimum) { return difficultyRank(base) >= difficultyRank(minimum) ? base : minimum; }

  function makeAirlineQuestion(airline, type, random) {
    const all = DATA.airlines;
    const codePair = `${airline.iata} / ${airline.icao}`;
    const base = {id:`airline-${airline.iata}-${type}`,category:'airlines',d:airline.d,media:null};

    if (type === 'logo') return {...base,text:'Which airline uses this logo?',correct:airline.name,options:shuffle([airline.name,...distractors(all.map(a=>a.name),airline.name,3,random)],random),media:`logo:${airline.iata}`,hint:`It is based in ${airline.country} and its main hub is ${airline.hub}.`,ex:`The logo belongs to ${airline.name}.`};
    if (type === 'codesToName') return {...base,category:'codes',d:harder(airline.d,'medium'),text:`Which airline uses the code pair ${codePair}?`,correct:airline.name,options:shuffle([airline.name,...distractors(all.map(a=>a.name),airline.name,3,random)],random),media:`codepair:${airline.iata}|${airline.icao}`,hint:`Its main hub is ${airline.hub}.`,ex:`${codePair} belongs to ${airline.name}.`};
    if (type === 'callsignToName') return {...base,category:'codes',d:harder(airline.d,'medium'),text:`Which airline uses the radio callsign “${airline.callsign}”?`,correct:airline.name,options:shuffle([airline.name,...distractors(all.map(a=>a.name),airline.name,3,random)],random),hint:`It is based in ${airline.country}.`,ex:`“${airline.callsign}” is used by ${airline.name}.`};
    if (type === 'cluesToName') return {...base,d:harder(airline.d,'medium'),text:`Which airline is based in ${airline.country}, uses ${airline.hub} as a main hub and is associated with ${airline.alliance}?`,correct:airline.name,options:shuffle([airline.name,...distractors(all.map(a=>a.name),airline.name,3,random)],random),hint:`Its IATA code starts with “${airline.iata[0]}”.`,ex:`Those clues describe ${airline.name}.`};
    if (type === 'nameToCodePair') return {...base,category:'codes',d:harder(airline.d,'medium'),text:`Which IATA / ICAO code pair is correct for ${airline.name}?`,correct:codePair,options:shuffle([codePair,...distractors(all.map(a=>`${a.iata} / ${a.icao}`),codePair,3,random)],random),hint:`The IATA designator has two characters and begins with “${airline.iata[0]}”.`,ex:`${airline.name} uses ${codePair}.`};
    if (type === 'hub') return {...base,d:harder(airline.d,'medium'),text:`Which is a main hub for ${airline.name}?`,correct:airline.hub,options:shuffle([airline.hub,...distractors(all.map(a=>a.hub),airline.hub,3,random)],random),hint:`The hub is in ${airline.country}.`,ex:`A main hub for ${airline.name} is ${airline.hub}.`};
    return {...base,d:harder(airline.d,'medium'),text:`Which alliance is ${airline.name} associated with?`,correct:airline.alliance,options:shuffle([airline.alliance,...distractors(['oneworld','Star Alliance','SkyTeam','None'],airline.alliance,3,random)],random),hint:`Its IATA code is ${airline.iata}.`,ex:airline.alliance === 'None' ? `${airline.name} is not listed here as a member of the three major global alliances.` : `${airline.name} is associated with ${airline.alliance}.`};
  }

  function makeAircraftQuestion(aircraft, type, random) {
    const all = DATA.aircraft;
    const base = {id:`aircraft-${aircraft.code}-${type}`,category:type.includes('Code')?'codes':'aircraft',d:aircraft.d,media:null};

    if (type === 'codeToName') return {...base,d:harder(aircraft.d,'medium'),text:`Which aircraft has the ICAO type designator ${aircraft.code}?`,correct:aircraft.name,options:shuffle([aircraft.name,...distractors(all.map(a=>a.name),aircraft.name,3,random)],random),media:`aircraftcode:${aircraft.code}`,hint:`It is a ${aircraft.type} made by ${aircraft.maker}.`,ex:`${aircraft.code} identifies the ${aircraft.name}.`};
    if (type === 'nameToCode') return {...base,d:harder(aircraft.d,'medium'),text:`What is the ICAO type designator for the ${aircraft.name}?`,correct:aircraft.code,options:shuffle([aircraft.code,...distractors(all.map(a=>a.code),aircraft.code,3,random)],random),hint:`The designator has ${aircraft.code.length} characters and starts with “${aircraft.code[0]}”.`,ex:`The ${aircraft.name} uses ${aircraft.code}.`};
    if (type === 'clueToName') return {...base,d:harder(aircraft.d,'medium'),text:aircraft.clue,correct:aircraft.name,options:shuffle([aircraft.name,...distractors(all.map(a=>a.name),aircraft.name,3,random)],random),hint:`It is a ${aircraft.type} manufactured by ${aircraft.maker}.`,ex:`The description matches the ${aircraft.name}.`};
    if (type === 'maker') {
      const candidates = all.filter(a=>a.maker !== aircraft.maker).map(a=>a.name);
      return {...base,d:harder(aircraft.d,'medium'),text:`Which of these aircraft is manufactured by ${aircraft.maker}?`,correct:aircraft.name,options:shuffle([aircraft.name,...distractors(candidates,aircraft.name,3,random)],random),hint:`Its ICAO type designator is ${aircraft.code}.`,ex:`The ${aircraft.name} is manufactured by ${aircraft.maker}.`};
    }
    if (type === 'engines') return {...base,d:harder(aircraft.d,'medium'),text:`How many engines does the ${aircraft.name} have?`,correct:String(aircraft.engines),options:shuffle([String(aircraft.engines),...distractors(['1','2','3','4'],String(aircraft.engines),3,random)],random),hint:`It is a ${aircraft.type}.`,ex:`The ${aircraft.name} has ${aircraft.engines} engines.`};
    return {...base,d:harder(aircraft.d,'medium'),text:`Which broad category best describes the ${aircraft.name}?`,correct:aircraft.type,options:shuffle([aircraft.type,...distractors(all.map(a=>a.type),aircraft.type,3,random)],random),hint:`Its ICAO type designator is ${aircraft.code}.`,ex:`The ${aircraft.name} is a ${aircraft.type}.`};
  }

  function makeAirportQuestion(airport, type, random) {
    const all = DATA.airports;
    const pair = `${airport.iata} / ${airport.icao}`;
    const base = {id:`airport-${airport.iata}-${type}`,category:type.includes('Code')?'codes':'airports',d:airport.d,media:null};

    if (type === 'iataToName') return {...base,d:harder(airport.d,'medium'),text:`Which airport uses the IATA code ${airport.iata}?`,correct:airport.name,options:shuffle([airport.name,...distractors(all.map(a=>a.name),airport.name,3,random)],random),media:`airportcode:${airport.iata}`,hint:`It is in ${airport.city}, ${airport.country}.`,ex:`${airport.iata} is ${airport.name}.`};
    if (type === 'icaoToName') return {...base,d:harder(airport.d,'medium'),text:`Which airport uses the ICAO code ${airport.icao}?`,correct:airport.name,options:shuffle([airport.name,...distractors(all.map(a=>a.name),airport.name,3,random)],random),media:`airportcode:${airport.icao}`,hint:`Its IATA code begins with “${airport.iata[0]}”.`,ex:`${airport.icao} is ${airport.name}.`};
    if (type === 'codesToName') return {...base,d:harder(airport.d,'hard'),text:`Which airport is identified by ${pair}?`,correct:airport.name,options:shuffle([airport.name,...distractors(all.map(a=>a.name),airport.name,3,random)],random),media:`codepair:${airport.iata}|${airport.icao}`,hint:`It serves ${airport.city} in ${airport.country}.`,ex:`${pair} identifies ${airport.name}.`};
    if (type === 'nameToPair') return {...base,d:harder(airport.d,'medium'),text:`Which IATA / ICAO pair is correct for ${airport.name}?`,correct:pair,options:shuffle([pair,...distractors(all.map(a=>`${a.iata} / ${a.icao}`),pair,3,random)],random),hint:`The IATA code begins with “${airport.iata[0]}”.`,ex:`${airport.name} uses ${pair}.`};
    if (type === 'cluesToName') return {...base,d:harder(airport.d,'medium'),text:`Which airport is in ${airport.country}, serves ${airport.city} and is known here for ${airport.hubFor}?`,correct:airport.name,options:shuffle([airport.name,...distractors(all.map(a=>a.name),airport.name,3,random)],random),hint:`Its IATA code has three letters and starts with “${airport.iata[0]}”.`,ex:`Those clues describe ${airport.name}.`};
    return {...base,d:harder(airport.d,'hard'),text:`How many runways are listed for ${airport.name} in this quiz database?`,correct:String(airport.runways),options:shuffle([String(airport.runways),...distractors(['1','2','3','4','5','6'],String(airport.runways),3,random)],random),hint:`Its IATA code is ${airport.iata}.`,ex:`${airport.name} is listed with ${airport.runways} runway${airport.runways===1?'':'s'}.`};
  }

  function makePool(random) {
    const questions = [];
    DATA.airlines.forEach(airline => ['logo','codesToName','callsignToName','cluesToName','nameToCodePair','hub','alliance'].forEach(type => questions.push(makeAirlineQuestion(airline,type,random))));
    DATA.aircraft.forEach(aircraft => ['codeToName','nameToCode','clueToName','maker','engines','type'].forEach(type => questions.push(makeAircraftQuestion(aircraft,type,random))));
    DATA.airports.forEach(airport => ['iataToName','icaoToName','codesToName','nameToPair','cluesToName','runways'].forEach(type => questions.push(makeAirportQuestion(airport,type,random))));
    DATA.knowledge.forEach(q => questions.push({...q,category:'knowledge',media:null,ex:`Correct answer: ${q.correct}.`}));
    DATA.liveries.forEach(q => questions.push({...q,category:'liveries',media:'livery',ex:`Correct answer: ${q.correct}.`}));
    return questions;
  }

  function mixFor(mode) {
    if (mode === 'daily') return {easy:.3,medium:.4,hard:.3};
    if (progress.level <= 2) return {easy:.4,medium:.4,hard:.2};
    if (progress.level <= 8) return {easy:.25,medium:.45,hard:.3};
    return {easy:.2,medium:.4,hard:.4};
  }

  function start(mode, category = null) {
    const random = mode === 'daily' ? seeded(today()) : Math.random;
    let pool = makePool(random);
    if (category) pool = pool.filter(question => question.category === category);

    const recentIds = new Set((progress.recent || []).flat());
    const fresh = pool.filter(question => !recentIds.has(question.id));
    if (fresh.length >= profile.count) pool = fresh;

    const mix = mixFor(mode);
    const selected = [];
    ['easy','medium','hard'].forEach((difficulty,index) => {
      const target = index === 2 ? profile.count - selected.length : Math.round(profile.count * mix[difficulty]);
      const candidates = pool.filter(q => q.d === difficulty && !selected.some(s => s.id === q.id));
      selected.push(...shuffle(candidates,random).slice(0,Math.max(0,target)));
    });
    while (selected.length < profile.count) {
      const candidate = shuffle(pool.filter(q => !selected.some(s => s.id === q.id)),random)[0];
      if (!candidate) break;
      selected.push(candidate);
    }

    quiz = {
      mode,
      category,
      questions: shuffle(selected,random).slice(0,profile.count),
      index:0,
      score:0,
      lives:3,
      streak:0,
      best:0,
      correct:0,
      answered:false,
      hintsLeft:3,
      hintUsed:false
    };

    $('modeLabel').textContent = mode === 'daily' ? 'DAILY CHALLENGE' : category ? `${category.toUpperCase()} CHALLENGE` : 'AVIATION JOURNEY';
    $('levelLabel').textContent = mode === 'daily' ? today() : `Level ${progress.level}`;
    show('quiz');
    renderQuestion();
  }

  function renderQuestion() {
    const q = quiz.questions[quiz.index];
    quiz.answered = false;
    quiz.hintUsed = false;
    $('counter').textContent = `${quiz.index + 1}/${quiz.questions.length}`;
    $('score').textContent = quiz.score;
    $('streak').textContent = quiz.streak;
    $('lives').textContent = '❤️'.repeat(quiz.lives) + '🖤'.repeat(3 - quiz.lives);
    $('bar').style.width = `${((quiz.index + 1) / quiz.questions.length) * 100}%`;
    $('difficulty').textContent = q.d.toUpperCase();
    $('difficulty').className = q.d;
    $('category').textContent = q.category.toUpperCase();
    $('question').textContent = q.text;
    $('feedback').className = 'feedback hidden';
    $('hintBox').className = 'hint-box hidden';
    $('next').classList.add('hidden');
    $('hintBtn').disabled = quiz.hintsLeft <= 0;
    $('hintBtn').textContent = quiz.hintsLeft > 0 ? `💡 Hint (${quiz.hintsLeft} left)` : '💡 No hints left';
    renderMedia(q.media);

    $('answers').innerHTML = '';
    q.options.forEach(option => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = option;
      button.addEventListener('click', () => answer(option,button));
      $('answers').appendChild(button);
    });
  }

  function renderMedia(media) {
    const element = $('media');
    if (!media) { element.classList.add('hidden'); element.innerHTML=''; return; }
    element.classList.remove('hidden');

    if (media.startsWith('logo:')) {
      const code = media.split(':')[1];
      element.innerHTML = `<img src="${logoUrl(code)}" alt="Airline logo" onerror="this.outerHTML='<div class=media-card><div class=large-code>${code}</div><small>Logo unavailable — use the code clue</small></div>'">`;
      return;
    }
    if (media.startsWith('codepair:')) {
      const [first,second] = media.split(':')[1].split('|');
      element.innerHTML = `<div class="media-card"><small>CODE PAIR</small><div class="large-code">${esc(first)} / ${esc(second)}</div></div>`;
      return;
    }
    if (media.startsWith('aircraftcode:') || media.startsWith('airportcode:')) {
      const code = media.split(':')[1];
      element.innerHTML = `<div class="media-card"><small>IDENTIFICATION CODE</small><div class="large-code">${esc(code)}</div></div>`;
      return;
    }
    element.innerHTML = '<div class="media-card"><div class="large-code">SPECIAL LIVERY</div><small>Use the description in the question</small></div>';
  }

  function showHint() {
    if (!quiz || quiz.answered || quiz.hintUsed || quiz.hintsLeft <= 0) return;
    const q = quiz.questions[quiz.index];
    quiz.hintUsed = true;
    quiz.hintsLeft -= 1;
    $('hintBox').textContent = `Hint: ${q.hint || `The answer starts with “${String(q.correct)[0]}”.`}`;
    $('hintBox').classList.remove('hidden');
    $('hintBtn').disabled = true;
    $('hintBtn').textContent = `💡 Hint used (${quiz.hintsLeft} left)`;
  }

  function answer(selected, button) {
    if (quiz.answered) return;
    quiz.answered = true;
    const q = quiz.questions[quiz.index];
    const correct = selected === q.correct;

    [...$('answers').children].forEach(answerButton => {
      answerButton.disabled = true;
      if (answerButton.textContent === q.correct) answerButton.classList.add('correct');
    });

    if (correct) {
      quiz.correct += 1;
      quiz.streak += 1;
      quiz.best = Math.max(quiz.best,quiz.streak);
      const base = {easy:100,medium:170,hard:260}[q.d];
      const streakBonus = Math.min(quiz.streak - 1,10) * 15;
      const earned = Math.round((base + streakBonus) * (quiz.hintUsed ? .65 : 1));
      quiz.score += earned;
      $('feedback').className = 'feedback ok';
      $('feedback').textContent = `Correct! ${q.ex}${quiz.hintUsed ? ` Hint used: ${earned} XP earned for this answer.` : ''}`;
      effects(true);
    } else {
      quiz.streak = 0;
      quiz.lives = Math.max(0,quiz.lives - 1);
      button.classList.add('wrong');
      $('feedback').className = 'feedback no';
      $('feedback').textContent = `Not quite. ${q.ex}`;
      effects(false);
    }

    $('score').textContent = quiz.score;
    $('streak').textContent = quiz.streak;
    $('lives').textContent = '❤️'.repeat(quiz.lives) + '🖤'.repeat(3 - quiz.lives);
    $('hintBtn').disabled = true;
    $('next').textContent = quiz.index === quiz.questions.length - 1 ? 'Finish challenge' : 'Next question';
    $('next').classList.remove('hidden');
  }

  function effects(correct) {
    if (profile.haptics && navigator.vibrate) navigator.vibrate(correct ? 40 : [60,30,60]);
    if (!profile.sound) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = correct ? 660 : 190;
      gain.gain.setValueAtTime(.04,context.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001,context.currentTime + .12);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + .12);
    } catch {}
  }

  function finish() {
    progress.xp += quiz.score;
    progress.totalCorrect += quiz.correct;
    progress.totalAnswered += quiz.questions.length;
    progress.bestStreak = Math.max(progress.bestStreak,quiz.best);
    progress.recent.push(quiz.questions.map(q => q.id));
    progress.recent = progress.recent.slice(-5);

    if (quiz.mode === 'daily' && progress.lastDaily !== today()) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth()+1).padStart(2,'0')}-${String(yesterday.getDate()).padStart(2,'0')}`;
      progress.dailyStreak = progress.lastDaily === yesterdayKey ? progress.dailyStreak + 1 : 1;
      progress.lastDaily = today();
    } else if (quiz.mode !== 'daily' && !quiz.category && quiz.correct >= Math.ceil(quiz.questions.length * .6)) {
      progress.level += 1;
    }

    if (quiz.category && quiz.correct >= Math.ceil(quiz.questions.length * .6)) {
      progress.categoryWins[quiz.category] = (progress.categoryWins[quiz.category] || 0) + 1;
    }

    save(K.progress,progress);
    const passed = quiz.correct >= Math.ceil(quiz.questions.length * .6);
    $('resultIcon').textContent = quiz.correct === quiz.questions.length ? '👑' : passed ? '🏆' : '🛬';
    $('resultTitle').textContent = quiz.correct === quiz.questions.length ? 'Perfect flight!' : passed ? 'Cleared for departure!' : 'Ready for another go';
    $('resultText').textContent = `You answered ${quiz.correct} of ${quiz.questions.length} correctly.`;
    $('resultCorrect').textContent = `${quiz.correct}/${quiz.questions.length}`;
    $('resultXp').textContent = quiz.score;
    $('resultBest').textContent = quiz.best;
    $('again').textContent = quiz.mode === 'daily' ? 'Return home' : 'Play again';
    show('result');
  }

  async function imageData(file, maxSize = 1100, quality = .76) {
    if (!file) return '';
    return await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = event => {
        const image = new Image();
        image.onload = () => {
          const scale = Math.min(1,maxSize / Math.max(image.width,image.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(image.width * scale);
          canvas.height = Math.round(image.height * scale);
          canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
          resolve(canvas.toDataURL('image/jpeg',quality));
        };
        image.src = event.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function applyHeroPhoto() {
    const image = $('a7HeroPhoto');
    const fallback = $('a7PhotoFallback');
    image.classList.remove('hidden');
    fallback.classList.add('hidden');
    image.src = heroPhoto || 'https://cdn.jetphotos.com/full/6/1254402_1781511283.jpg';
    image.onerror = () => { image.classList.add('hidden'); fallback.classList.remove('hidden'); };
  }

  function getArSpots() {
    const keys = ['ggAdventureArSpots', 'aq_ar_spots', 'aviquest_ar_spots'];
    const merged = [];
    const used = new Set();
    keys.forEach(key => {
      load(key, []).forEach(item => {
        const id = item.id || `${item.timestamp}-${item.aircraftId || item.registration || item.callsign}`;
        if (!used.has(id)) { used.add(id); merged.push(item); }
      });
    });
    arSpots = merged;
    return merged;
  }

  function renderArSpots() {
    const element = $('arSpotList');
    if (!element) return;
    const entries = getArSpots().slice().sort((a,b) =>
      new Date(b.timestamp || b.date || b.created || 0) - new Date(a.timestamp || a.date || a.created || 0)
    );
    if (!entries.length) {
      element.innerHTML = '<div class="item"><h3>No AR-spotted aircraft yet</h3><small>Open Live AR Spotter, tap an aircraft and choose “Mark spotted”.</small></div>';
      return;
    }
    element.innerHTML = entries.map(spot => {
      const title = spot.callsign || spot.registration || spot.reg || (spot.hex ? String(spot.hex).toUpperCase() : '') || 'Aircraft';
      const reg = spot.registration || spot.reg || '';
      const type = spot.type || spot.model || spot.description || '';
      const km = Number.isFinite(Number(spot.distanceKm)) ? `${Number(spot.distanceKm).toFixed(1)} km` :
        Number.isFinite(Number(spot.distanceNm)) ? `${(Number(spot.distanceNm) * 1.852).toFixed(1)} km` : '';
      const when = new Date(spot.timestamp || spot.date || spot.created || Date.now()).toLocaleString('en-AU');
      return `<article class="item ar-spot-item">
        <span class="spot-source-badge">AR</span>
        <h3>${esc(title)}</h3>
        <small>${esc([reg,type,km].filter(Boolean).join(' • ') || 'Live AR sighting')}</small>
        <small>${esc(when)}</small>
      </article>`;
    }).join('');
  }

  function setSpotCategory(category) {
    const ar = category === 'ar';
    $('showArSpots').classList.toggle('active', ar);
    $('showCameraSpots').classList.toggle('active', !ar);
    $('arSpotsPanel').classList.toggle('hidden', !ar);
    $('cameraSpotsPanel').classList.toggle('hidden', ar);
    if (ar) renderArSpots(); else renderSpots();
  }

  function renderSpots() {
    const element = $('spotList');
    if (!spots.length) { element.innerHTML = '<div class="item">No aircraft recorded yet.</div>'; return; }
    element.innerHTML = spots.slice().sort((a,b)=>b.created-a.created).map(spot => `
      <article class="item">
        <button data-delspot="${spot.id}" type="button">🗑️</button>
        <h3>${esc(spot.reg || spot.model || 'Aircraft sighting')}</h3>
        <small>${esc(spot.airline || 'Unknown airline')} • ${esc(spot.model || 'Unknown model')}</small>
        <small>${new Date(spot.date).toLocaleString()}${spot.location ? ` • ${esc(spot.location)}` : ''}</small>
        ${spot.livery ? `<p>${esc(spot.livery)}</p>` : ''}
        ${spot.notes ? `<p>${esc(spot.notes)}</p>` : ''}
        ${spot.photo ? `<img src="${spot.photo}" alt="Saved aircraft photo" />` : ''}
      </article>`).join('');
    element.querySelectorAll('[data-delspot]').forEach(button => button.addEventListener('click', () => {
      spots = spots.filter(spot => spot.id !== button.dataset.delspot);
      save(K.spots,spots);
      renderSpots();
      refreshHome();
    }));
  }

  function renderHangar() {
    document.querySelectorAll('[data-tab]').forEach(button => button.classList.toggle('active',button.dataset.tab === tab));
    $('hangarGrid').innerHTML = DATA.collections[tab].map(([name,description]) => `
      <article class="item">
        <button data-fav="${esc(name)}" type="button">${favs[tab].includes(name) ? '★' : '☆'}</button>
        <h3>${esc(name)}</h3><small>${esc(description)}</small>
      </article>`).join('');
    document.querySelectorAll('[data-fav]').forEach(button => button.addEventListener('click', () => {
      const name = button.dataset.fav;
      favs[tab] = favs[tab].includes(name) ? favs[tab].filter(item => item !== name) : [...favs[tab],name];
      save(K.favourites,favs);
      renderHangar();
    }));
  }

  function renderAchievements() {
    const categoryWins = Object.keys(progress.categoryWins || {}).length;
    const achievements = [
      ['✈️','First Flight','Complete one quiz',progress.totalAnswered>0],
      ['☀️','Daily Flyer','Complete a Daily Challenge',Boolean(progress.lastDaily)],
      ['🔥','On a Roll','Reach a five-answer streak',progress.bestStreak>=5],
      ['🧠','Serious Student','Answer 100 questions',progress.totalAnswered>=100],
      ['📸','Plane Spotter','Record an aircraft',spots.length>0],
      ['🛫','Busy Apron','Record ten aircraft',spots.length>=10],
      ['⭐','Personal Hangar','Save five favourites',Object.values(favs).flat().length>=5],
      ['🎓','Category Explorer','Pass four category challenges',categoryWins>=4],
      ['🏆','Aviation Expert','Earn 10,000 XP',progress.xp>=10000],
      ['💚','Georgia Pro','Use this personalised edition',true]
    ];
    $('achievementGrid').innerHTML = achievements.map(item => `<article class="item ${item[3]?'':'locked'}"><h2>${item[3]?item[0]:'🔒'}</h2><h3>${item[1]}</h3><small>${item[2]}</small></article>`).join('');
  }

  function renderIdeas() {
    const element = $('ideaList');
    if (!ideas.length) { element.innerHTML = '<div class="item">No ideas saved yet.</div>'; return; }
    element.innerHTML = ideas.slice().sort((a,b)=>b.created-a.created).map(idea => `
      <article class="item ${idea.done?'locked':''}">
        <h3>${esc(idea.category)}</h3><p>${esc(idea.text)}</p>
        <button data-toggleidea="${idea.id}" type="button">${idea.done?'Reopen':'Complete'}</button>
        <button data-delidea="${idea.id}" type="button">Delete</button>
      </article>`).join('');
    element.querySelectorAll('[data-toggleidea]').forEach(button => button.addEventListener('click', () => {
      ideas = ideas.map(idea => idea.id === button.dataset.toggleidea ? {...idea,done:!idea.done} : idea);
      save(K.ideas,ideas); renderIdeas();
    }));
    element.querySelectorAll('[data-delidea]').forEach(button => button.addEventListener('click', () => {
      ideas = ideas.filter(idea => idea.id !== button.dataset.delidea);
      save(K.ideas,ideas); renderIdeas();
    }));
  }

  function download(name,data) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url),500);
  }

  document.addEventListener('click', event => {
    const viewButton = event.target.closest('[data-view]');
    if (viewButton) show(viewButton.dataset.view);
    const modeButton = event.target.closest('[data-mode]');
    if (modeButton) start(modeButton.dataset.mode);
    const categoryButton = event.target.closest('[data-category]');
    if (categoryButton) start('category',categoryButton.dataset.category);
  });

  $('settingsBtn').addEventListener('click', () => show('settings'));
  $('hintBtn').addEventListener('click', showHint);
  $('next').addEventListener('click', () => {
    if (!quiz?.answered) return;
    if (quiz.index < quiz.questions.length - 1) { quiz.index += 1; renderQuestion(); }
    else finish();
  });
  $('again').addEventListener('click', () => quiz.mode === 'daily' ? show('home') : start(quiz.category ? 'category' : 'journey',quiz.category));
  $('pauseBtn').addEventListener('click', () => $('pause').classList.remove('hidden'));
  $('resume').addEventListener('click', () => $('pause').classList.add('hidden'));
  $('quit').addEventListener('click', () => { $('pause').classList.add('hidden'); show('home'); });

  $('chooseHeroPhoto').addEventListener('click', () => $('heroPhotoInput').click());
  $('heroPhotoInput').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    heroPhoto = await imageData(file,1300,.8);
    localStorage.setItem(K.heroPhoto,heroPhoto);
    applyHeroPhoto();
    event.target.value = '';
  });
  $('restoreHeroPhoto').addEventListener('click', () => {
    heroPhoto = '';
    localStorage.removeItem(K.heroPhoto);
    applyHeroPhoto();
  });

  $('spotForm').addEventListener('submit', async event => {
    event.preventDefault();
    spots.push({
      id:String(Date.now()),
      date:$('spotDate').value,
      reg:$('reg').value.trim().toUpperCase(),
      airline:$('airline').value.trim(),
      model:$('model').value.trim(),
      location:$('location').value.trim(),
      livery:$('livery').value.trim(),
      notes:$('notes').value.trim(),
      photo:await imageData($('photo').files[0],1000,.72),
      created:Date.now()
    });
    save(K.spots,spots);
    event.target.reset();
    $('spotDate').value = new Date().toISOString().slice(0,16);
    renderSpots(); refreshHome();
  });

  $('locate').addEventListener('click', () => {
    if (!navigator.geolocation) { alert('Location is unavailable in this browser.'); return; }
    navigator.geolocation.getCurrentPosition(
      position => $('location').value = `${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)}`,
      () => alert('Location permission was unavailable.')
    );
  });
  $('exportSpots').addEventListener('click', () => download(`Georgia-Spotter-Log-${today()}.json`,spots));

  document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => { tab = button.dataset.tab; renderHangar(); }));
  $('showArSpots').addEventListener('click', () => setSpotCategory('ar'));
  $('showCameraSpots').addEventListener('click', () => setSpotCategory('camera'));


  $('ideaForm').addEventListener('submit', event => {
    event.preventDefault();
    ideas.push({id:String(Date.now()),text:$('ideaText').value.trim(),category:$('ideaCategory').value,done:false,created:Date.now()});
    save(K.ideas,ideas); event.target.reset(); renderIdeas();
  });
  $('exportIdeas').addEventListener('click', () => download(`AviQuest-Ideas-${today()}.json`,ideas));
  $('clearIdeas').addEventListener('click', () => { ideas = ideas.filter(idea => !idea.done); save(K.ideas,ideas); renderIdeas(); });

  $('saveSettings').addEventListener('click', () => {
    profile = {
      name:$('playerName').value.trim() || 'Georgia',
      sound:$('sound').checked,
      haptics:$('haptics').checked,
      large:$('largeText').checked,
      reduced:$('reducedMotion').checked,
      count:Number($('questionCount').value)
    };
    save(K.profile,profile); applyProfile(); alert('Settings saved.');
  });

  $('resetProgress').addEventListener('click', () => {
    if (!confirm('Reset Georgia’s levels, XP, daily streak and quiz scores? Spotter entries, ideas, favourites, photos and settings will stay.')) return;
    progress = freshProgress();
    save(K.progress,progress);
    refreshHome();
    renderAchievements();
    alert('Quiz progress has been reset to Level 1 with 0 XP.');
  });

  $('resetAll').addEventListener('click', () => {
    if (!confirm('Reset the entire AviQuest app, including spotting entries and ideas?')) return;
    Object.values(K).forEach(key => localStorage.removeItem(key));
    location.reload();
  });

  function applyProfile() {
    $('playerName').value = profile.name;
    $('sound').checked = profile.sound;
    $('haptics').checked = profile.haptics;
    $('largeText').checked = profile.large;
    $('reducedMotion').checked = profile.reduced;
    $('questionCount').value = String(profile.count);
    document.body.classList.toggle('large',profile.large);
    document.body.classList.toggle('reduced',profile.reduced);
    refreshHome();
  }

  $('spotDate').value = new Date().toISOString().slice(0,16);
  applyProfile();
  applyHeroPhoto();
  renderSpots();
  renderHangar();
  renderIdeas();
  renderAchievements();
  show('home');

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./service-worker.js?v=2').catch(() => {});
  }
})();
