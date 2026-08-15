(function(){
  function initFooterAccordion(){
    if(typeof gsap==='undefined'){console.warn('[footer-accordion] GSAP not found');return;}
    var BREAKPOINT=991;
    var columns=document.querySelectorAll('.footer_links');
    if(!columns.length)return;
    var state={mode:null};

    function setMobile(){
      columns.forEach(function(col){
        var header=col.querySelector('.footer_links_header');
        var list=col.querySelector('.footer_link-list');
        if(!header||!list)return;
        gsap.set(list,{height:0,overflow:'hidden'});
        header.classList.remove('is-open');
        header.style.cursor='pointer';
        if(!header.dataset.faBound){
          header.dataset.faBound='1';
          header.addEventListener('click',function(){
            if(window.innerWidth>BREAKPOINT)return;
            var isOpen=header.classList.contains('is-open');
            if(isOpen){
              gsap.to(list,{height:0,duration:0.4,ease:'expo.out'});
              header.classList.remove('is-open');
            }else{
              gsap.to(list,{height:'auto',duration:0.4,ease:'expo.out'});
              header.classList.add('is-open');
            }
          });
        }
      });
    }

    function setDesktop(){
      columns.forEach(function(col){
        var header=col.querySelector('.footer_links_header');
        var list=col.querySelector('.footer_link-list');
        if(!header||!list)return;
        gsap.set(list,{clearProps:'height,overflow'});
        header.classList.remove('is-open');
        header.style.cursor='';
      });
    }

    function update(){
      var mode=window.innerWidth<=BREAKPOINT?'mobile':'desktop';
      if(mode===state.mode)return;
      state.mode=mode;
      if(mode==='mobile')setMobile();else setDesktop();
    }

    update();
    var t;
    window.addEventListener('resize',function(){
      clearTimeout(t);
      t=setTimeout(update,150);
    });
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',initFooterAccordion);
  }else{
    initFooterAccordion();
  }
})();