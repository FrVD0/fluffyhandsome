class ComicViewer{
  constructor(seriesEl){
    this.host = seriesEl;
    this.progressEl = seriesEl.querySelector('.progress');
    this.stage = seriesEl.querySelector('.stage');
    this.layers = seriesEl.querySelectorAll('.layer');
    this.imgA = this.layers[0].querySelector('img');
    this.imgB = this.layers[1].querySelector('img');
    this.btnPrev = seriesEl.querySelector('.btn.prev');
    this.btnNext = seriesEl.querySelector('.btn.next');
    this.zonePrev = seriesEl.querySelector('.zone.left');
    this.zoneNext = seriesEl.querySelector('.zone.right');
    this.idx = 0; this.showingA = true; this.animating = false;
    this.pages = [];

    // Bind events
    this.btnPrev.addEventListener('click', ()=>this.prev());
    this.btnNext.addEventListener('click', ()=>this.next());
    this.zonePrev.addEventListener('click', ()=>this.prev());
    this.zoneNext.addEventListener('click', ()=>this.next());
    this.stage.addEventListener('keydown', (e)=>{
      const k = e.key;
      if(["ArrowRight"," ","Enter","ArrowDown"].includes(k)){ e.preventDefault(); this.next(); }
      if(["ArrowLeft","Backspace","ArrowUp"].includes(k)){ e.preventDefault(); this.prev(); }
      if(k==='f'){ this.toggleFullscreen(); }
    });
    let lastTap=0;
    this.stage.addEventListener('click',()=>{ const now=Date.now(); if(now-lastTap<300) this.toggleFullscreen(); lastTap=now; });
    let touchX=null;
    this.stage.addEventListener('touchstart',(e)=>{ touchX=e.changedTouches[0].clientX; },{passive:true});
    this.stage.addEventListener('touchend',(e)=>{ if(touchX==null) return; const dx=e.changedTouches[0].clientX - touchX; if(Math.abs(dx)>40){ dx<0?this.next():this.prev(); } touchX=null; },{passive:true});

    // Lazy init when visible
    const io = new IntersectionObserver((entries)=>{
      entries.forEach(entry=>{ if(entry.isIntersecting){ io.disconnect(); this.init(); } });
    },{rootMargin:'200px'});
    io.observe(this.host);

    // Refit on resize/orientation
    window.addEventListener('resize', ()=>this.fitStage());
    window.addEventListener('orientationchange', ()=>this.fitStage());
  }

  async init(){
    // Prefer external JSON via data-src; fallback to inline <script.pages>
    const src = this.host.getAttribute('data-src');
    if(src){
      try{
        const res = await fetch(src, {cache:'no-store'});
        this.pages = await res.json();
      }catch(e){ console.error('Failed to load pages.json for', this.host.id, e); this.pages = []; }
    }
    if(!this.pages.length){
      const s = this.host.querySelector('script.pages');
      if(s){ try{ this.pages = JSON.parse(s.textContent.trim()); }catch{} }
    }
    if(!this.pages.length){
      this.stage.innerHTML = '<div style="padding:16px;color:#999">No pages configured.</div>';
      return;
    }
    // Seed first image
    this.setImage(this.imgA, this.pages[this.idx]);
    this.imgA.onload = ()=>{ this.fitToImage(this.imgA); this.updateProgress(); this.preloadAround(this.idx); };
    this.imgA.onerror = ()=>{ this.fitStage(2/3); this.updateProgress(); };
    // Reasonable initial size before natural sizes arrive
    this.fitStage(2/3);
  }

  setImage(img, page){ img.src = page.src; img.alt = page.alt || ''; img.style.willChange = 'opacity, transform, filter'; }
  updateProgress(){ this.progressEl.textContent = `${this.idx+1} / ${this.pages.length}`; this.btnPrev.disabled = (this.idx===0); this.btnNext.disabled = (this.idx===this.pages.length-1); }
  preloadAround(i){ [i, i+1, i-1].forEach(n=>{ if(n>=0 && n<this.pages.length){ const im=new Image(); im.src=this.pages[n].src; } }); }
  fitToImage(img){ if(img.naturalWidth && img.naturalHeight){ const a = img.naturalWidth/img.naturalHeight; this.fitStage(a); } else { this.fitStage(2/3); } }

  fitStage(aspectHint){
    const card = this.host.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const availableW = Math.max(280, card.width);
    const availableH = Math.max(280, Math.min(vh*0.82, 1200));
    const a = (Number.isFinite(aspectHint) && aspectHint>0) ? aspectHint : 2/3;
    let w = Math.min(availableW, availableH * a);
    let h = w / a;
    if(h > availableH){ h = availableH; w = h * a; }
    this.stage.style.width = Math.round(w) + 'px';
    this.stage.style.height = Math.round(h) + 'px';
  }

  next(){ if(this.idx < this.pages.length-1){ this.show(this.idx+1, +1); } }
  prev(){ if(this.idx > 0){ this.show(this.idx-1, -1); } }

  show(index, direction=1){
    if(this.animating) return;
    index = Math.max(0, Math.min(this.pages.length-1, index));
    if(index === this.idx && (this.imgA.src || this.imgB.src)) return;
    this.animating = true;

    const nextPage = this.pages[index];
    const currentLayer = this.showingA ? this.layers[0] : this.layers[1];
    const nextLayer    = this.showingA ? this.layers[1] : this.layers[0];
    const nextImg      = this.showingA ? this.imgB : this.imgA;

    const begin = ()=>{
      const a = (nextImg.naturalWidth && nextImg.naturalHeight) ? (nextImg.naturalWidth/nextImg.naturalHeight) : undefined;
      this.fitStage(a);
      nextLayer.classList.add('active','appear');
      if((this.imgA.src || this.imgB.src)) currentLayer.classList.add('vanish');
      const onDone=()=>{
        currentLayer.classList.remove('active','vanish');
        nextLayer.classList.remove('appear');
        this.showingA = !this.showingA; this.idx = index;
        this.updateProgress(); this.preloadAround(this.idx); this.animating=false; nextLayer.removeEventListener('animationend', onDone);
      };
      nextLayer.addEventListener('animationend', onDone);
    };

    this.setImage(nextImg, nextPage);
    if(nextImg.complete && nextImg.naturalWidth){ begin(); }
    else { nextImg.onload = ()=>begin(); nextImg.onerror = ()=>{ this.fitStage(); begin(); }; }
  }

  toggleFullscreen(){ const el = document.documentElement; if(!document.fullscreenElement){ el.requestFullscreen?.(); } else { document.exitFullscreen?.(); } }
}

document.querySelectorAll('.series').forEach(el => new ComicViewer(el));
