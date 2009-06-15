const tab_width = 100;
var canvas_height = 600; // TODO: set this using window.innerHeight and dynamically adjust
const tab_margin = 20;

function toggleViz(){
	var tabviz = jQuery("#tabviz", window.content.document);
	if (tabviz.length > 0) {
		tabviz.remove();
	} else {
		appendViz();
	}
}
	
function appendViz() {
	canvas_height=window.innerHeight;
	var xml_dom = readLog();
	
	// determine currently open tab
	LOG("Selected tab: " + com_dubroy_tlogger.getTabId(gBrowser.selectedTab));
	var current_tab = jQuery("#" + com_dubroy_tlogger.getTabId(gBrowser.selectedTab), xml_dom);
	
	// get current root tab (by going upwards in the DOM and looking for the last tab element)
	var root_tab;
	current_tab.parents().each(function(i){
		if (this.tagName == "tab") {
			root_tab = jQuery(this);
		}
	});
	if (root_tab == undefined) {
		root_tab = current_tab;
	}
	LOG("root_tab: " + root_tab.attr('id'));
	
//	// add the tabviz stylesheet to the current page
//	var tabviz_style = jQuery(document.createElement("link")).attr({ 
//		id: "tabviz-style",
//		type: "text/css",
//		rel: "stylesheet",
//		href: "chrome://tabviz/skin/tabviz.css"
//	});
//	jQuery("head", window.content.document).append(tabviz_style);
//	var jquery_svg_style = jQuery(document.createElement("link")).attr({ 
//		id: "jquery-svg-style",
//		type: "text/css",
//		rel: "stylesheet",
//		href: "chrome://tabviz/content/lib/jquery/jquery.svg.package-1.3.1/jquery.svg.css"
//	});
//	jQuery("head", window.content.document).append(jquery_svg_style);

//			var head = content.document.getElementsByTagName("head")[0];
//			var style = content.document.getElementById("tabviz-style");
//			style = content.document.createElement("link");
//			style.id = "link-target-finder-style";
//			style.type = "text/css";
//			style.rel = "stylesheet";
//			style.href = "chrome://tabviz/skin/skin.css";
//			head.appendChild(style);

	// add the container div#tabviz for the visualization
	jQuery(content.document.createElement("div")).attr({
		id: "tabviz",
		style: "position: fixed; bottom: 0px; z-index: 100; left: 0px; width: 100%; height: " + canvas_height + "px;"
	}).appendTo(jQuery("body", window.content.document));
	
	//Draw backdrop
	var tabviz = jQuery('#tabviz', window.content.document);
	LOG("tabviz: " + tabviz.attr("id"));
	tabviz.svg();
	var svg = tabviz.svg('get');
	
	//TODO: clicking on background toggles viz
	var background=svg.rect(0, 0, '100%', '100%',  
    {fill: 'black', opacity: 0});
    
  jQuery(background).bind('click', function(event){
		if (tabviz.length > 0) {
			tabviz.remove();
		}
	});

	//Draw backdrop
	var defs = svg.defs();
	svg.radialGradient(defs, 'radial_grey', 
    [['0%', 'black','.87'], ['30%', 'black','.8'], ['70%', 'black','.6'], ['100%', 'black','0']], 
    '50%', '50%', '50%', '50%', '50%',
    {gradientUnits: 'objectBoundingBox'});
	var sizeOfBg=countTabLevels(root_tab)*(tab_width+tab_margin)+50; //approximate good size for background
    svg.circle(0, '100%', sizeOfBg, {fill: 'url(#radial_grey)'});
	
	// ---- draw root tab ---
	drawTab(root_tab, 1, 1, 0, svg, 90, 0, current_tab);
}
	
function drawTab(tab, level, tab_count, tab_current, svg, available_angle, angle_offset, current_tab) { // svg should not have to be passed to the function
	tab = jQuery(tab);
	var pages = tab.children("page");
	
	if (typeof available_angle == 'undefined' ) available_angle = 90;
	if (typeof angle_offset == 'undefined' ) angle_offset = 0;
	
	var outer_radius = (tab_width * level)     + tab_margin * (level-1);
	var inner_radius = (tab_width * (level-1)) + tab_margin * (level-1);
	
	var start_angle = (available_angle/tab_count) * tab_current     + angle_offset;
	var end_angle   = (available_angle/tab_count) * (tab_current+1) + angle_offset;
	var start_cos   = Math.cos(start_angle * (Math.PI/180));
	var start_sin   = Math.sin(start_angle * (Math.PI/180));
	var end_cos     = Math.cos(end_angle   * (Math.PI/180));
	var end_sin     = Math.sin(end_angle   * (Math.PI/180));
	// error 
	if (start_angle == 90) start_cos = 0; // not sure why cos(90) is not 0 above
	if (end_angle == 90) end_cos = 0; // not sure why cos(90) is not 0 above
	
	var x1 = start_sin * outer_radius;
	var y1 = start_cos * outer_radius;
	var x2 = end_sin   * outer_radius;
	var y2 = end_cos   * outer_radius;
	var x3 = end_sin   * inner_radius;
	var y3 = end_cos   * inner_radius;
	var x4 = start_sin * inner_radius;
	var y4 = start_cos * inner_radius;
	

	// ### draw image & page title
	var page = tab.children("page:last");
	
//	var stopwatch = new Date();
//	var screenshot_width;
//	var screenshot_height;
//	var before_time = stopwatch.getTime();
//	var screenshot = jQuery(content.document.createElement("img")).attr({
//		id: page.attr('time'),
//		src: "chrome://tabviz/content/screenshots/" + page.attr('time') + ".png",
//		style: "visibility: hidden;"
//	}).load(function(event){
//		var screenshot_width = jQuery(this).width();
//		var screenshot_height = jQuery(this).height();
//		
//		LOG("onload before_time: " + before_time);
//		LOG("onload dimensions (" + page.attr('time') + ".png) : " + screenshot_width + " x " + screenshot_height + " time: " + (stopwatch.getTime() - before_time));
//		jQuery(this).remove();
//	});
//	jQuery("body", window.content.document).append(screenshot);
//	
//	LOG("after dimensions (" + page.attr('time') + ".png) : " + screenshot_width + " x " + screenshot_height + " time: " + (stopwatch.getTime() - before_time));
//	if (!screenshot_width) screenshot_width = 1680;
//	if (!screenshot_height) screenshot_height = 856;
	
	var path = svg.createPath(); // TODO not ideal.  we only need one path object for the whole app
	
	var group = svg.group(tab.attr('id'), {'clip-path': 'url(#' + tab.attr('id') + '-path)'});
	
	var img = new Image();
img.onload = function() { 
//This doesn't work if the user ever changes their browser size, but it's the best we've got for now.
	var screenshot_width = img.width;
	var screenshot_height = img.height;
	
//Need to use the image to grab its dimensions	chrome://tabviz/content/screenshots/' + page.attr('time') + '.png'
	
	
	// draw image
	var thumb_height = (y1 - y3) * 1.5;
	var thumb_width = (thumb_height * screenshot_width) / screenshot_height;
	svg.image(group, x4, canvas_height-y1, thumb_width, thumb_height,
		'chrome://tabviz/content/screenshots/' + page.attr('time') + '.png',
		{id: page.attr('time'), opacity: 1});
 };
	img.src = 'chrome://tabviz/content/screenshots/' + page.attr('time') + '.png';
	
	
	var defs = svg.defs();
	svg.linearGradient(defs, 'page_title_backg', 
    [[0, 'white', 0], [1, 'white', 1]],
		'0%', '0%', '0%', '100%',
    {gradientUnits: 'objectBoundingBox'});
	
	// draw background for page title
	svg.rect(group, x3, canvas_height-y3, 100, 20, 0, 0,
	  {fill: 'url(#page_title_backg)',
		 transform: 'rotate(' + (-1 * (90-end_angle)) + ', ' + x3 + ', ' + (canvas_height-y3) + ') translate(0, -20)'});
	
	// draw page title
	svg.text(group, x3+((pages.length-1)*20), canvas_height-y3, page.attr('page_title'),
		{style: 'font-family: Arial, Helvetica, sans-serif; font-size: 12px;',
		 transform: 'rotate(' + (-1 * (90-end_angle)) + ', ' + (x3) + ', ' + (canvas_height-y3) + ') ' +
		 						'translate(4, -5)'}); 
		 
	// draw clipPath
	var clipPath = svg.other('clipPath', {id: tab.attr('id') + '-path'});
	svg.path(clipPath,
		  path.moveTo(x1, canvas_height-y1)
			.arcTo(outer_radius, outer_radius, -90, false, true, x2, canvas_height-y2)
			.lineTo(x3, canvas_height-y3)
			.arcTo(inner_radius, inner_radius, -90, false, false, x4, canvas_height-y4)
			.close()
	);
		
	// ---- draw path -----
	// unviewed tab
	if (tab.attr('status') == "unviewed") {
		svg.path(
		  path.moveTo(x1, canvas_height-y1)
			.arcTo(outer_radius, outer_radius, -90, false, true, x2, canvas_height-y2)
			.lineTo(x3, canvas_height-y3)
			.arcTo(inner_radius, inner_radius, -90, false, false, x4, canvas_height-y4)
			.close(),
		  {stroke: 'none', 'stroke-width': 0, fill: 'yellow', opacity: '0.15', 'shape-rendering': 'crispEdges'}
		);
	}
	
	svg.path(
	  path.moveTo(x1, canvas_height-y1)
		.arcTo(outer_radius, outer_radius, -90, false, true, x2, canvas_height-y2)
		.lineTo(x3, canvas_height-y3)
		.arcTo(inner_radius, inner_radius, -90, false, false, x4, canvas_height-y4)
		.close(),
	  {stroke: 'grey', 'stroke-width': 2, 'shape-rendering': 'crispEdges', fill: 'none'}
	);
	
	//draw a clear wedge on top of the current one and make clicking it switch to that browser tab
	var clickpath=svg.path(
	  path.moveTo(x1, canvas_height-y1)
		.arcTo(outer_radius, outer_radius, -90, false, true, x2, canvas_height-y2)
		.lineTo(x3, canvas_height-y3)
		.arcTo(inner_radius, inner_radius, -90, false, false, x4, canvas_height-y4)
		.close(),
	  {fill: 'white', opacity: '0'}
	);	
	jQuery(clickpath).bind('click', {tab_id: tab.attr("id")}, function(event){
		com_dubroy_tlogger.openTab(event.data.tab_id)
	});
	
	// ---- draw page bands ----
	pages.each(function(i) {
		if (i > 0) { 
			var page_radius = inner_radius + (20 * i);
			
			var x1p = start_sin * page_radius;
			var y1p = start_cos * page_radius;
			var x2p = end_sin   * page_radius;
			var y2p = end_cos   * page_radius;
			
			svg.path(
			  path.moveTo(x1p, canvas_height-y1p)
				.arcTo(page_radius, page_radius, -90, false, true, x2p, canvas_height-y2p)
				.lineTo(x3, canvas_height-y3)
				.arcTo(inner_radius, inner_radius, -90, false, false, x4, canvas_height-y4)
				.close(),
			  {stroke: 'grey', 'stroke-width': 2, fill: 'none'}
			);
		}
	});
	
	// current tab
	if (tab.attr('id') == current_tab.attr('id')) {
		svg.path(
		  path.moveTo(x1, canvas_height-y1)
			.arcTo(outer_radius, outer_radius, -90, false, true, x2, canvas_height-y2)
			.lineTo(x3, canvas_height-y3)
			.arcTo(inner_radius, inner_radius, -90, false, false, x4, canvas_height-y4)
			.close(),
		  {stroke: 'orange', 'stroke-width': 2, fill: 'none'}
		);
	}
	
	var tab_children = tab.children("tab");
	tab_children.each(function(i) {
		drawTab(this, level+1, tab_children.length, i, svg, available_angle/tab_count, start_angle, current_tab);
	});
}

function readLog() {
	// read XML file
	var file = Components.classes["@mozilla.org/file/directory_service;1"].getService(Components.interfaces.nsIProperties).get("ProfD", Components.interfaces.nsIFile);
	file.append("tabviz");
	file.append("open_tabs.xml");
	
	var xml_string = "";
	var fstream = Components.classes["@mozilla.org/network/file-input-stream;1"].
	                        createInstance(Components.interfaces.nsIFileInputStream);
	var cstream = Components.classes["@mozilla.org/intl/converter-input-stream;1"].
	                        createInstance(Components.interfaces.nsIConverterInputStream);
	fstream.init(file, -1, 0, 0);
	cstream.init(fstream, "UTF-8", 0, 0);
	
	let (str = {}) {
	  cstream.readString(-1, str); // read the whole file and put it in str.value
	  xml_string = str.value;
	}
	cstream.close();
	fstream.close();
	
	//alert(xml_string);
	
	// parse XML
	var domParser = new DOMParser();
	var xml_dom = domParser.parseFromString(xml_string, "text/xml");
	
	return xml_dom;
}

function countTabLevels(tab) {
	var count=1; //count current level
	var tab_children = tab.children("tab");
	var maxcount=1;
	tab_children.each(function(i) {
		var temp=count+countTabLevels(jQuery(this));
		if (temp > maxcount) {
			maxcount=temp;
		}
	});
	return maxcount;
}

function LOG(msg) {
  var consoleService = Components.classes["@mozilla.org/consoleservice;1"]
                                 .getService(Components.interfaces.nsIConsoleService);
  consoleService.logStringMessage(msg);
}