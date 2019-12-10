function setupSlideshow(root) {
    console.log(root);
    var width = root.offsetWidth;
    var slides = [].slice.call(root.querySelectorAll("li"));
    var slider = root.querySelector(".slider-js");
    if (!slider) {
        return console.log(`I couldn't find the slider`)
    }

    if ([].slice.call(slider.classList).indexOf("ok") > 0) {
        return
    }

    slider.style.width = width * slides.length + "px";
    slider.classList.add("flex", "ok");
    
    slides.forEach(function(slide) {
        slide.style.width = width + "px";
    });

    function createEmptyNav() {
        var emptyNav = document.createElement('div');
        emptyNav.classList.add('w-20');
        emptyNav.innerHTML = '&nbsp;';
        return emptyNav;
    }

    slides.forEach(function(slide, index, items) {
        var leftNav = document.createElement("div");
        leftNav.classList.add('left-nav');
        leftNav.innerHTML = "<svg viewBox='0 0 10 16' xmlns='http:\/\/www.w3.org/2000/svg' class='pagination-icon mr2'><polyline fill='none' vectorEffect='non-scaling-stroke' points='8,2 2,8 8,14'></polyline></svg><span class='ttu'> Prev</span>";
        leftNav.onclick = function() {
            return root.scrollLeft -= width;
        };

        var rightNav = document.createElement("div");
        rightNav.classList.add('right-nav', 'tr');
        rightNav.innerHTML = "<span class='ttu'>Next  </span><svg viewBox='0 0 10 16' xmlns='http:\/\/www.w3.org/2000/svg' class='pagination-icon ml2'><polyline fill='none' vectorEffect='non-scaling-stroke' points='2,2 8,8 2,14'></polyline></svg>";
        rightNav.onclick = function(e) {
            root.scrollLeft += width;
        };

        var navigation = slide.querySelector(".navigation-js");
        if (!navigation) {
            return console.log("I couldn't find the navigation");
        }
        navigation.prepend(index === 0 ? createEmptyNav() : leftNav);
        navigation.append(index === items.length - 1 ? createEmptyNav() : rightNav);
    });
}

document.querySelectorAll(".slideshow-js").forEach(setupSlideshow);
console.log(document.querySelectorAll(".slideshow-js"));
