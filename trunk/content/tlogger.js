/*
 * tlogger: a Firefox extension for capturing click-stream web browsing logs
 *
 * Copyright (c) 2009 Patrick Dubroy (http://dubroy.com)
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * as published by the Free Software Foundation; either version 2
 * of the License, or (at your option) any later version.
 * 
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
 *
 */

var com_dubroy_tlogger = function() {


//----------------------------------------------------------------------------

// Constants
//----------------------------------------------------------------------------

const Cc = Components.classes;
const Ci = Components.interfaces;

const FORMAT_HEX = 16;

//----------------------------------------------------------------------------

// Window-level global variables
//----------------------------------------------------------------------------

var globals;

var log_write = null;

var nextTabId = 0;

// We need to keep a ref to any weak listeners, so they don't disappear once
// they go out of scope
var weakListeners = Array();

// For convenience, this will be mapped to the global string obfuscation func
var obf;

// For some reason, sometimes the session history object is null when
// the window is first loaded. Use this var to keep track of whether or not
// the listener has already been attached. If not, we'll try again later.
var sessionHistoryListenerAttached = false;

//----------------------------------------------------------------------------

// Misc helper functions
//----------------------------------------------------------------------------



// For debugging, map TRACE to dump; otherwise, make it a no-op

//var TRACE = function(str) { dump(str + "\n"); };

var TRACE = function(){}


function getCurrentTimeMillis()
{
	return (new Date()).getTime();
}

function log_error(message, originalException) {
	// First, attempt to report the error in the error console
	try {
		if (originalException) {
			Components.utils.reportError(originalException);
		} else {
			Components.utils.reportError(new Error(message));
		}
	} catch(ex) {
		// Do nothing
	}

	// Then, if we have a log file, try to report it there
	try {
		if (log_write) {
			var errorDetails = {};
			try {
				// Fill in the details bit-by-bit in case an exception occurs
				errorDetails.message = message;
				errorDetails.exception = originalException.toString();
				errorDetails.file = originalException.fileName;
				errorDetails.line = originalException.lineNumber;
			} catch(ex) {
				// Do nothing
			}
			log_write("ERROR", errorDetails);
			
			// If we successfully logged the error, that's good enough
			return;
		}
	} catch(ex) {
		// Do nothing
	}
	
	// If we haven't reported the error by now, put up an alert	
	var detailedDescription = "None";
	try {
		// Fill in the description bit by bit, so that if an
		// exception occurs at any point, we still have some useful info
		detailedDescription = "'" + originalException.toString() + "'";
		detailedDescription += " in " + originalException.fileName;
		detailedDescription += " at line " + originalException.lineNumber;
	} catch(ex) {
		// Swallow the exception
	}
	alert("tlogger completely failed to initialize: " + detailedDescription);
}



// This function provides a way to hang our own data off the tab object.
// The first time it is called for a tab, a new object is created to hold the
// tab data, and this object is returned from this and subsequent calls.
function getTabData(tab)

{
	if (!("com_dubroy_tlogger_data" in tab)) {
		var data = {};

		tab.com_dubroy_tlogger_data = data;

		// Get a session-unique id for the tab
		data.tabId = getWindowId() + "T" + nextTabId.toString(FORMAT_HEX);

		nextTabId += 1;

		log_write("tab_registered", {"tabId":data.tabId});

		var browser = gBrowser.getBrowserAtIndex(tab._tPos);
		try {
			// Attach a progress listener to the tab.
			// We need to attach the listeners to the individual tabs, and not
			// to the gBrowser, in order to get all events for background tabs
			
			// NB: addProgressListener only keeps a weak ref to the listener,
			// so we *must* keep a pointer to it for it to stay alive
			data.progressListener = new MyProgressListener(tab);
			browser.addProgressListener(data.progressListener);
		} catch(ex) {
			log_error("Failed to attach progress listener to tab " + data.tabId, ex);
		}
		
		try {
			data.DOMContentLoadedListener = function (e) { handleLoadEvent(e, tab, true); };

			browser.addEventListener("DOMContentLoaded", data.DOMContentLoadedListener, true);
		} catch (ex) {
			log_error("Failed to hook DOMContentLoaded in tab " + data.tabId, ex);
		}
		try {
			data.loadListener = function (e) { handleLoadEvent(e, tab, false); };

			browser.addEventListener("load", data.loadListener, true);
		} catch (ex) {
			log_error("Failed to hook browser load  in tab " + data.tabId, ex);
		}
	}

	return tab.com_dubroy_tlogger_data;

}

function getTabId(tab) {
	return getTabData(tab).tabId;
}

function getCurrentTabId() {
	return getTabId(gBrowser.selectedTab);
}

function registerWindow()
{
	window.com_dubroy_tlogger_id = globals.getWindowId(window);
}

function getWindowId() {
	return window.com_dubroy_tlogger_id;
}

function obf_url(str)
{
//Don't need this function anymore because we care about actual URLs, unlike the tab logger study.
	return str;
}

function tryAttachSessionHistoryListener() {
	if (!sessionHistoryListenerAttached) {
		try {
			getWebNavigation().sessionHistory.addSHistoryListener(historyListener);
		} catch (ex) {
			return false;
		}
		sessionHistoryListenerAttached = true;
	}
	return true;
}

/**
 * window_onload - run when the browser.xul window is loaded
 */
function window_onload() {
	try {
		globals = Cc["@dubroy.com/tlogger/globals;1"].getService().wrappedJSObject;

		registerWindow(window);

		// Build a custom logging function that includes the window id in every event
		log_write = globals.buildLogFunction({"win":getWindowId()});
	
		isNewTabEvent=true;
		_lastSelectedTabId=getWindowId() + "T0";//hack...
		previouslySelectedTabId=getWindowId() + "T0";//... because the first tab doesn't get caught otherwise

		log_write("window_onload");
	} catch (ex) {
		log_error("Initialization failed", ex);

		// There's no point in continuing
		return;
	}
	
	try {	
		// Register tab event handlers

		var container = getBrowser().tabContainer;
		container.addEventListener("SSTabRestoring", logTabRestore, true);
		container.addEventListener("TabOpen", logTabOpen, true);
		container.addEventListener("TabSelect", logTabSelect, true);
		container.addEventListener("TabMove", logTabMove, true);
		container.addEventListener("TabClose", logTabClose, true);
	} catch (ex) {
		log_error("Failed to hook tab events", ex);
	}

	try {
		// Hook when the user right clicks on a link and selects "Open Link in New Window"
		// or "Open Link in New Tab" from the context menu.
		var menuItem = document.getElementById("context-openlinkintab");
		insertPreCode(menuItem, "com_dubroy_tlogger.rightClickedLink(true);");
		menuItem = document.getElementById("context-openlink");
		insertPreCode(menuItem, "com_dubroy_tlogger.rightClickedLink(false);");
	} catch (ex) {
		log_error("Failed to hook right-click menu", ex);
	}

	try {
		// Hook the action of opening a BLANK new window or new tab
		// By hooking the commands, we catch all the different ways of doing it.
		var cmd = document.getElementById("cmd_newNavigator");
		insertPreCode(cmd, "com_dubroy_tlogger.openedNewWindow();");
		cmd = document.getElementById("cmd_newNavigatorTab");
		insertPreCode(cmd, "com_dubroy_tlogger.openedNewTab();");
	} catch (ex) {
		log_error("Failed to hook new tab/new window", ex);
	}

	try {
		// Log when text is typed into the URL bar
		var old_handleURLBarCommand = window.handleURLBarCommand;
		window.handleURLBarCommand = function(event) {
			try {
				log_write("URLBarCommand", {});
			} catch (ex) {
				log_error("Exception while logging URLBarCommand", ex);
			} finally {
				old_handleURLBarCommand.call(window, event);
			}

		}
	} catch (ex) {
		log_error("Failed to hook URL bar commands", ex);
	}

	if (!tryAttachSessionHistoryListener()) {
		log_error("Failed to add session history listener", ex);	
	}

	// Hook BrowserHome (when "home" button is clicked"), etc.	
	try {
		var old_BrowserHome = BrowserHome;
		BrowserHome = function() {
			try {
				log_write("GoHome", {});
			} catch (ex) {
				log_error("Exception logging GoHome", ex);
			}
			old_BrowserHome();
		}
	} catch (ex) {
		log_error("Failed to hook BrowserHome");
	}

	// Hook BrowserGoHome (when Alt-Home is pressed in Fx3)
	if ("BrowserGoHome" in window) {
		try {
			var old_BrowserGoHome = BrowserGoHome;
			BrowserGoHome = function(aEvent) {
				try {
					log_write("GoHome", {});
				} catch (ex) {
					log_error("Exception logging GoHome", ex);
				}
				old_BrowserHome();
			}
		} catch (ex) {
			log_error("Failed to hook BrowserGoHome", ex);
		}
	}

	if ("BrowserHomeClick" in window) {
		try {
			var old_BrowserHomeClick = BrowserHomeClick;
			BrowserHomeClick = function(aEvent) {
				try {
					log_write("BrowserHomeClick", {});
				} catch (ex) {
					log_error("Exception logging BrowserHomeClick", ex);
				}
				old_BrowserHomeClick.call(this, aEvent);
			}
		} catch (ex) {
			log_error("Failed to hook BrowserHomeClick", ex);
		}
	}
	
	// Hook searches launched from the search bar

	try {
		// It's version dependent how the search bar is accessed
		var searchBar = ("searchBar" in BrowserSearch) ? 
			BrowserSearch.searchBar : BrowserSearch.getSearchBar();

		var old_doSearch = searchBar.doSearch;
		searchBar.doSearch = function(aData, aWhere) {
			try {
				log_write("SearchBarSearch", {});
			} catch (ex) {
				log_error("Exception while logging search bar search", ex);
			}

			return old_doSearch.call(searchBar, aData, aWhere);

		};
	} catch (ex) {
		log_error("Failed to hook search bar searches", ex);
	}
	
	try {

		// Hook searches launched by right-clicking on selected text
		var old_loadSearch = BrowserSearch.loadSearch;

		BrowserSearch.loadSearch = function(searchText, useTab) {
			try {
				log_write("RightClickSearch", {});
			} catch (ex) {
				log_error("Exception logging right-click search", ex);
			}

			old_loadSearch.call(BrowserSearch, searchText, useTab);
		};
	} catch (ex) {
		log_error("Failed to hook right-click search", ex);
	}

	// Hook form submission
	try {
		// nsIObserverService is only scriptable in Fx3
		// For Fx2, see hookFormSubmit and handleLoadEvent
		if (globals.firefoxMajorVersion == 3) {

			var observerService = Cc["@mozilla.org/observer-service;1"].
				getService(Ci.nsIObserverService);
			observerService.addObserver(formSubmitObserver, "earlyformsubmit", false);
		}
	} catch(ex) {
		log_error("Failed to hook form_submit", ex);
	}

	// Hooking bookmark selection is highly version-specific
	// In the Fx3 case, we only get the notification after the LocationChange
	
	if (globals.firefoxMajorVersion == 3) {
		try {
			Cc["@mozilla.org/browser/nav-history-service;1"]
				.getService(Ci.nsINavHistoryService)
				.addObserver(historyChangeObserver, false);	
		} catch(ex) {
			log_error("Failed to add history observer", ex);	
		}
	}
	
	if (globals.firefoxMajorVersion == 2) {
		try {
			var old_openOneBookmark = BookmarksCommand.openOneBookmark;
			BookmarksCommand.openOneBookmark = function(aURI, aTargetBrowser, aDS) {
				var data = {};
				// Be sure that we at least log the command, if not the url
				try {
					data.url = obf_url(BookmarksUtils.getProperty(aURI,
						"http://home.netscape.com/NC-rdf#URL",
						aDS));
				} catch(ex) {
					log_error("Failed to get bookmark url", ex);
				}
				log_write("openOneBookmark", data);
				return old_openOneBookmark.call(this, aURI, aTargetBrowser, aDS);
			}
			
			var old_openGroupBookmark = BookmarksCommand.openGroupBookmark;
			BookmarksCommand.openGroupBookmark = function (aURI, aTargetBrowser) {
				log_write("openGroupBookmark", {});
				return old_openGroupBookmark.call(this, aURI, aTargetBrowser);
			}
		} catch(ex) {
			log_error("Failed to hook bookmark selection", ex);
		}
	}

	
	try {
		window.addEventListener("mousedown", function(e) {
			lastActivityTime = getCurrentTimeMillis();		
			log_write("window_mousedown", {"which":e.which, "ctrlKey":e.ctrlKey, 
				"shiftKey":e.shiftKey, "altKey":e.altKey, "metaKey":e.metaKey});
		}, true);
	} catch(ex) {
		log_error("Failed to mousedown listener on window",  ex);
	}
	
	try {
		window.addEventListener("focus", window_focus, true);
		window.addEventListener("blur", window_blur, true);
	} catch(ex) {
		log_error("Failed to hook focus/blur", ex);
	}
	
	try {
		window.addEventListener("keydown", window_keydown, true);
		window.addEventListener ("DOMMouseScroll", window_scroll, true);


	} catch(ex) {
		log_error("Failed to add input listeners");
	}

	// We don't get a TabOpen event for the first (default) tab, so fake it

	tabOpenImpl(gBrowser.selectedTab, "default");
	
	log_write("tlogger_init");

}



function window_onunload()

{

	log_write("window_unload");



	// TODO: Unregister any hooks/observers/etc.

	Cc["@mozilla.org/observer-service;1"]
		.getService(Ci.nsIObserverService)
		.removeObserver(formSubmitObserver, "earlyformsubmit");

	Cc["@mozilla.org/browser/nav-history-service;1"]
		.getService(Ci.nsINavHistoryService)
		.removeObserver(historyChangeObserver);
	
	window.removeEventListener("focus", window_focus);
	window.removeEventListener("blur", window_blur);
	window.removeEventListener("keydown", window_keydown);
	window.removeEventListener("DOMMouseScroll", window_scroll);
	
	timer.cancel();
}

var isWindowFocused = false;
var timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
var timerLastTickMillis = -1;
var isUserActive = true;

var timerTarget = {
	notify: function(timer) {
		if (isWindowFocused) {
			// Print a space & the millis elapsed since the timer was started
			var currentTimeMillis = getCurrentTimeMillis();
			globals.getFocusLog().write(" " + (currentTimeMillis - timerLastTickMillis));
			timerLastTickMillis = currentTimeMillis;

			// Check if the user has been inactive longer than a minute			
			const ONE_MINUTE_IN_MILLIS = 60000;
			
			var millisSinceActivity = currentTimeMillis - lastActivityTime;
			
			if (isUserActive && (millisSinceActivity >= ONE_MINUTE_IN_MILLIS)) {
				isUserActive = false;
				globals.getFocusLog().write(
					"\n" + currentTimeMillis + " " + getWindowId() + " inactive");
			}
			if (!isUserActive && (millisSinceActivity < ONE_MINUTE_IN_MILLIS)) {
				isUserActive = true;
				// NB: The timestamp here is lastActivityTime, but the ticks
				// that come after it are still relative to the last focus time	
				globals.getFocusLog().write(
					"\n" + lastActivityTime + " " + getWindowId() + " active");
			}
		} else {
			timer.cancel();
			timerLastTickMillis = -1;
		}
	}
};

function window_focus(e)
{
	const MILLIS_PER_TICK = 500;

	if (!isWindowFocused) {
		isWindowFocused = true;
		var currentTimeMillis = getCurrentTimeMillis();
		globals.getFocusLog().write("\n" + currentTimeMillis + " " + getWindowId() + " focus");

		if (timerLastTickMillis < 0) {
			timerLastTickMillis = currentTimeMillis;
			// Example line:
			// 1226282384020 W0 focus 505 560 488
			timer.initWithCallback(timerTarget, MILLIS_PER_TICK, Ci.nsITimer.TYPE_REPEATING_SLACK);
		}
	}
}

function window_blur(e)
{
	if (isWindowFocused) {
		isWindowFocused = false;
		globals.getFocusLog().write("\n" + timerLastTickMillis + " " + getWindowId() + " blur");
	}
}

var lastActivityTime = getCurrentTimeMillis();
var lastKeyDownTime = 0;

function window_keydown(e)
{
	lastActivityTime = lastKeyDownTime = getCurrentTimeMillis();
}

function window_scroll(e)
{
	lastActivityTime = getCurrentTimeMillis();
}



function insertPreCode(item, preCodeString)
{
	var originalOnCommand = item.getAttribute("oncommand");
	item.setAttribute("oncommand", preCodeString + originalOnCommand);
}



/**
 * rightClickedLink: The user has used the context menu to open a link in a new
 *     tab or a new window
 * @param isNewTab indicates whether it's a new tab. If false, it's a new window.
 */
function rightClickedLink(isNewTab)

{
	try {

		if (gContextMenu.onLink) {
			var linkText = gContextMenu.link.innerHTML;
			var url = gContextMenu.linkURL;
		}
		log_write("RIGHT_CLICK", {"url":obf_url(url)});

	} catch(ex) {
		log_error("Exception while logging RIGHT_CLICK", ex);
	}
}



function openedNewWindow()

{
	try {
		log_write("NEW_WINDOW");
	} catch(ex) {
		log_error("Exception while logging NEW_WINDOW", ex);
	}

}



function openedNewTab()

{
	try {
		log_write("NEW_TAB");
		isNewTabEvent=true;
	} catch(ex) {
		log_error("Exception while logging NEW_TAB", ex);
	}

}

function logTabRestore(event)
{
	try {
		tabOpenImpl(event.target, "restore");
	} catch(ex) {
		log_error("Exception while logging TabRestore", ex);
	}
}



function logTabOpen(event)

{
	try {

		tabOpenImpl(event.target);
	} catch(ex) {
		log_error("Exception in logTabOpen", ex);
	}

}

var formSubmitObserver = {
	QueryInterface: function(aIID) {
		if (aIID.equals(Ci.nsIObserver) ||
			aIID.equals(Ci.nsIFormSubmitObserver) ||
			aIID.equals(Ci.nsISupportsWeakReference) ||
			aIID.equals(Ci.nsISupports))
		{
			return this;
		}
		throw Components.results.NS_NOINTERFACE;
	},
	
	notify : function (formElement, aWindow, actionURI) {
		log_write("form_submit", 
			{"action":obf_url(actionURI.spec)});
	
		return true;
	},
	
	observe : function (subject, topic, data) {}
};

// This class implements nsIWebProgressListener, which can be used to listen
// for the progress of load events on a given tab.
var MyProgressListener = function(tab) {
	this._tab = tab;
	this._tabId = getTabId(tab);
}

// Required to implement nsIWebProgressListener
MyProgressListener.prototype.QueryInterface = function(aIID) {
	if (aIID.equals(Ci.nsIWebProgressListener) ||
		aIID.equals(Ci.nsISupportsWeakReference) ||
		aIID.equals(Ci.nsISupports))
	{
		return this;
	}
	throw Components.results.NS_NOINTERFACE;
};

// Handle state changes: load start, stop, etc.
MyProgressListener.prototype.onStateChange = function(aProgress, aRequest, aFlag, aStatus) {
	try {
		var nsIWPL = Ci.nsIWebProgressListener;
		var tab = this._tab;
		var tabData = getTabData(tab);
		if (aFlag & nsIWPL.STATE_START) {
			// Output a load start event if (a) it's for the top-level doc, or
			// (b) it's a redirect of a previous top-level load event
			
			var redirectUrl = tabData.pendingRedirectFrom;
			if (redirectUrl) {
				log_write("redirect", {"tabId":this._tabId, "tabIndex":tab._tPos,
					"from_url":obf_url(redirectUrl), "to_url":obf_url(aRequest.name)});
				tabData.pendingRequest = aRequest;
			} else if (aFlag & nsIWPL.STATE_IS_DOCUMENT) {
				var doc = aProgress.DOMWindow.wrappedJSObject.document;
				
				var isTopLevel = false;
				if (gBrowser.getBrowserIndexForDocument(doc) >= 0) {
					isTopLevel = true;
				}

				// Walk the javascript stack to figure out if the load
				// was caused by javascript in the page itself
				var lastJSframe = Components.stack;
				while (lastJSframe.caller) {
					lastJSframe = lastJSframe.caller;
				}
				
				log_write("load_start", {"tabId":this._tabId, "tabIndex":tab._tPos,
					"href":obf_url(aRequest.name), "cause":obf_url(lastJSframe.filename),
					"isTopLevel":isTopLevel, "lastKeyDownTime":lastKeyDownTime});
					
				if (isTopLevel) {
					tabData.pendingRedirectFrom = null;
					tabData.pendingRequest = aRequest;
				}
			}
		} else if (aFlag & nsIWPL.STATE_REDIRECTING) {
			// Only handle redirects beginning with top-level load events
			if (aRequest === tabData.pendingRequest) {
				getTabData(this._tab).pendingRedirectFrom = aRequest.name;
			}
		} else {
			// Don't allow this to get stale
			tabData.pendingRedirectFrom = null;		
		}
	} catch(ex) {
		log_error("Exception logging onStateChange", ex);
	}
	return 0;
};

// This fires when the location bar changes; i.e load event is confirmed
// If there are redirects, e.g http://google.com -> http://www.google.ca,
// then it will only be called at the end of the redirect chain.
MyProgressListener.prototype.onLocationChange = function(aProgress, aRequest, aURI) {
	try {
		var win = aProgress.DOMWindow.wrappedJSObject;
		var tab = this._tab;

		var isTopLevel = false;
		if (gBrowser.getBrowserIndexForDocument(win.document) >= 0) {
			isTopLevel = true;
		}

		// Walk the javascript stack to figure out if the LocationChange
		// was caused by javascript in the page itself
		var lastJSframe = Components.stack;
		while (lastJSframe.caller) {
			lastJSframe = lastJSframe.caller;
		}
		log_write("LocationChange", {
			"tabId":this._tabId, "tabIndex":tab._tPos, "href":obf_url(win.location.href),
			"cause":obf_url(lastJSframe.filename), "isTopLevel":isTopLevel,
			"lastKeyDownTime":lastKeyDownTime});
			mostRecentUrl=win.location.href;
			//TABVIZ SECTION
			
/*		alert("LocationChange|" + "tabId:" + this._tabId + " href: " + win.location.href + "cause: " + obf_url(lastJSframe.filename) + " isTopLevel: " + isTopLevel +
			" lastKeyDownTime: " + lastKeyDownTime);*/
			//alert("tabId: " + this._tabId + " page: "+ win.location.href + " Time: " + getCurrentTimeMillis());

			var xml_dom = readLog();
							
			// try to get current tab
			var log_tab = jQuery("#" + this._tabId, xml_dom);
			var is_new_tab = false; // flag whether this is a new or existing tab
			
			if (log_tab.length == 0) { // tab doesn't exist yet
				var is_new_tab = true;
				// create tab
				log_tab = jQuery(xml_dom.createElement("tab")).attr({
					id: this._tabId,
					status: "unviewed",
					time: getCurrentTimeMillis()
				});
				jQuery("open_tabs", xml_dom).append(log_tab);
				LOG("created new tab:" + log_tab.attr('id') + " and appended to XML");
			}
			
			// check if page reload represents a new page
			if (jQuery("page:last", log_tab).attr("url") != win.location.href  &&  win.location.href != "about:blank" && win.location.href != "undefined" ) {
			
			//account for Google results' redirects
			var replaceLastUrl=false;
			try {
				var temp=(jQuery("page:last", log_tab).attr("url")).lastIndexOf("http://www.google.com/url?sa=t");
				if (temp==0) {
					replaceLastUrl=true;
				}
				else
				{
					replaceLastUrl=false;
				}
			}
			catch(ex)
			{
			replaceLastUrl=false;
			}

			if (replaceLastUrl==true)
			{
				//delete most recently added page because it was a Google redirect
				jQuery("page:last", log_tab).remove();
			}
		
			// create and append page to tab
				log_tab.append(jQuery(xml_dom.createElement("page")).attr({
					url: win.location.href,
					time: getCurrentTimeMillis()
				}));
				
				writeLog(xml_dom); // write XML to file
				LOG("created new page in tab: " + log_tab.attr('id') + " and wrote to XML");
			}
			
			//TABVIZ SECTION
						
		
		if (isTopLevel) {
			// It's possible that this wasn't attached during onLoad, so we'll
			// check here to make sure it's attached
			if (!tryAttachSessionHistoryListener()) {
				log_error("After LocChange, SHistory listener still not attached", ex);
			}
		}
	} catch(ex) {
		log_error("Exception logging LocationChange", ex);
	}
	return 0;
};

// We don't need these handlers, but they must be present
MyProgressListener.prototype.onProgressChange = function() {return 0;};
MyProgressListener.prototype.onStatusChange = function() {return 0;};
MyProgressListener.prototype.onSecurityChange = function() {return 0;};
MyProgressListener.prototype.onLinkIconAvailable = function() {return 0;};

function tabOpenImpl(tab, cause) {
	try {
		var tabId = getTabId(tab);
		//TABVIZ TODO put parents into directory structure
		if (isNewTabEvent==false && cause!="default" && cause!="restore") {
			//alert("OPENING NEW TAB " + tabId + " from tab " + _lastSelectedTabId + " cause: " + cause + " /time: " + getCurrentTimeMillis());
			
			var xml_dom = readLog();
			LOG("search for: new tab = " + tabId + " AND parent tab = " + _lastSelectedTabId);
			var log_tab = jQuery("#" + tabId, xml_dom);
			var parent_tab = jQuery("#" + _lastSelectedTabId, xml_dom);
			LOG("found: new tab = " + log_tab.attr('id') + " AND parent tab = " + parent_tab.attr('id'));
			
			if (log_tab.length == 0) {
				// create tab
				log_tab = jQuery(xml_dom.createElement("tab")).attr({
					id: tabId,
					status: "unviewed",
					time: getCurrentTimeMillis()
				});
				LOG("created new tab:" + log_tab.attr('id'));
			}
			
			if (log_tab.length > 0 && parent_tab.length > 0) {
				log_tab.appendTo(parent_tab);  // append/move the current tab to its parent
				writeLog(xml_dom);
				LOG("appended: " + log_tab.attr('id') + " to: " + parent_tab.attr('id') + " and wrote to XML");
			}
		}
		isNewTabEvent=true;

		if (!cause) {
			cause = "unknown";
		}
		
		// We handle TabRestore almost the same way as TabOpen. However,
		// we don't need to ask any questions on TabRestore
		if (cause == "restore") {
			log_write("TabRestore", {"tabId":tabId, "tabIndex":tab._tPos});
			isNewTabEvent=true;
		} else {
			log_write("TabOpen", {"cause":cause, "tabId":tabId, "tabIndex":tab._tPos});
		}
	} catch (ex) {
		log_error("Exception in tabOpenImpl", ex);
	}

}



// These are necessary to keep track of what the previously selected tab was,

// because by the time we get the TabSelect event, we've already switched

var mostRecentUrl;
var _lastSelectedTabId;
var previouslySelectedTabId;
var isNewTabEvent;

function logTabSelect(event)

{
	try {

		var url = gBrowser.selectedBrowser.contentDocument.URL;

		if (gBrowser.selectedTab != event.target) {

			log_write("WARNING", 
				{"message":"in logTabSelect, gBrowser.selectedTab != event.target"});
		}

		var label = gBrowser.selectedTab.label;
		var tabId = getTabId(gBrowser.selectedTab);
		var tabIndex = gBrowser.selectedTab._tPos;

		log_write("TabSelect", {"tabIndex":tabIndex, "tabId":tabId, "url":obf_url(url)});

		if (url != "about:blank") {
				takeScreenshot({"tabId":tabId, "tabIndex":tabIndex});
		}
		previouslySelectedTabId=_lastSelectedTabId;
		_lastSelectedTabId = tabId;
		
		//TABVIZ SECTION for selecting a tab and marking as viewed
		//alert("INLOGTABSELECT: switching from tab " + previouslySelectedTabId + " to tab " + _lastSelectedTabId);
		
			var xml_dom = readLog();
			
			// modify tab to be viewed
			var log_tab = jQuery("#" + tabId, xml_dom);
			
			if ( log_tab.length > 0 ) { 
				log_tab = (jQuery("#" + tabId, xml_dom)).attr({
					status: "viewed"
				});
				
				// write XML to file
				writeLog(xml_dom);
				
				LOG("viewed tab: " + log_tab.attr('id') + " - and wrote to XML");
			}
			
			//TABVIZ SECTION
		
		
		} catch(ex) {
		log_error("Exception logging TabSelect", ex);
	}
}

function logTabMove(event)
{
	try {
		log_write("TabMove", {"tabId":getTabId(event.target), "tabIndex":event.target._tPos});
	} catch (ex) {
		log_error("Exception logging TabMove", ex);
	}
}

function logTabClose(event) 
{
	try {

		log_write("TabClose", {"tabId":getTabId(event.target), "tabIndex":event.target._tPos});
		
		var xml_dom = readLog();
		//mark this tab as closed
		jQuery("open_tabs", xml_dom).append(jQuery("#" + getTabId(event.target), xml_dom).attr({
		status: "closed"
		}));
		writeLog(xml_dom);
				
	} catch(ex) {
		log_error("Exception logging TabClose", ex);
	}
	
	// Remove listeners. Might not be strictly necessary, but it's a good idea
	try {
		var tab = event.target;
		var browser = gBrowser.getBrowserAtIndex(tab._tPos);
		var data = getTabData(tab);
		browser.removeProgressListener(data.progressListener);
		data.progressListener = null;
		browser.removeEventListener("DOMContentLoaded", data.DOMContentLoadedListener, true);
		data.DOMContentLoadedListener = null;
		browser.removeEventListener("load", data.loadListener, true);
		data.loadListener = null;		
	} catch(ex) {
		log_error("Exception removing listeners for tab " + getTabId(tab), ex);
	}
}

// These will store the original values of the two methods on the window

// object that we want to override

var old_openNewTabWith;

var old_openNewWindowWith;

function window_openNewTabWith(href, sourceURL)

{
	try {

		log_write("openNewTabWith", {"href":obf_url(href), "sourceURL":obf_url(sourceURL.URL)});
		isNewTabEvent=false;
		
	} catch(ex) {
		log_error("Exception in window_openNewTabWith", ex);
	}
}

function window_openNewWindowWith(href, sourceURL) {
	try {
		log_write("openNewWindowWith", {"href":obf_url(href), "sourceURL":obf_url(sourceURL.URL)});
	} catch(ex) {
		log_error("Exception in window_openNewWindowWith", ex);
	}
}


/**
 * If the element or one of its parents is an HTML anchor element (<a>), return that node.
 * If not, return null.
 */
function getLinkElementOrNull(element) {
	var node = element;

	while (node) {
		if (node instanceof HTMLAnchorElement) {
			return node;
		}
		node = node.parentNode;
	}
	return null;
}

function XULElement(element_name)
{
	return document.createElementNS(
		"http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", 
		element_name);
}

/**
 * Handler for _all_ document click events (any mouse button and/or modifiers).
 */
function document_onclick(event) {
	try {

		var anchor = getLinkElementOrNull(event.originalTarget);
		if (anchor) {
			var targetAttr = anchor.getAttribute("target");
			var target = targetAttr ? targetAttr : "";
			// Don't obfuscate when the target is a new window, or empty
			if ((target != "_blank") && (target.length > 0)) {
				target = "<name>";
			}
		
			log_write("LINK_CLICK", 
				{"href":obf_url(anchor.href), "target":target,
				"which": event.which, "ctrlKey":event.ctrlKey, 
				"shiftKey":event.shiftKey, "altKey":event.altKey, "metaKey":event.metaKey});

		} else {
			log_write("DOCUMENT_CLICK", 
				{"which":event.which, "ctrlKey":event.ctrlKey, 
				"shiftKey":event.shiftKey, "altKey":event.altKey, "metaKey":event.metaKey});

		}
	} catch(ex) {
		log_error("Exception while logging DOCUMENT_CLICK", ex);
	}
}


// This is only used (and only works) under Fx2
function hookFormSubmit(document, isTopLevel) {
	try {
		var win = document.defaultView.wrappedJSObject;

		// This listener will catch when the user actually clicks
		// on a submit button in the form
		document.addEventListener("submit", 
			function(e) {
				log_write("form_submit", 
					{"action":obf_url(e.target.action), "isTopLevel":isTopLevel});			
			}, 
			true);

		// Also need to hook when form.submit() is called from js
		var old_submit = win.HTMLFormElement.prototype.submit;
		win.HTMLFormElement.prototype.submit = function() {
			log_write("form_submit", 
				{"action":obf_url(this.action), "isTopLevel":isTopLevel});
			return old_submit.call(this);
		}
	} catch(ex) {
		log_error("Failed to hook form_submit on document", ex);
	}
}

// This only works with Fx2, because in Fx3, we can't get access to the
// *real* window.location object, only a XPCOM wrapper
function hookJavascriptNavigation(document, isTopLevel) 
{
	try {
		var contentWin = document.defaultView.wrappedJSObject;

		function log_js_location_change() {
			try {
				log_write("js_location_change", {"isTopLevel":isTopLevel});
			} catch(ex) {
				log_error("Error logging js_location_change", ex);
			}
		}

		function watchCallback(id, oldval, newval) {
			log_js_location_change();
			return newval;
		}
		
		// Modifying any of these fields will cause a LocationChange
		contentWin.watch("location", watchCallback);
		contentWin.location.watch("href", watchCallback);
		contentWin.location.watch("hash", watchCallback);
		contentWin.location.watch("search", watchCallback);
		contentWin.location.watch("pathname", watchCallback);
		contentWin.location.watch("host", watchCallback);
		contentWin.location.watch("hostname", watchCallback);
		contentWin.location.watch("port", watchCallback);
		contentWin.location.watch("protocol", watchCallback);		
	} catch(ex) {
		log_error("Failed to hook js navigation", ex);
	}
}

/**
 * Capture all load events that happen in a tab.
 * If 'isDOMContentLoadedEvent' is true, then we are handling
 * the DOMContentLoaded event; otherwise, it's the "load" event.
 */
function handleLoadEvent(event, tab, isDOMContentLoadedEvent) {
	try {
		if (event.originalTarget instanceof HTMLDocument) {
			var doc = event.originalTarget;
			
			var isTopLevel = false;
			if (gBrowser.getBrowserIndexForDocument(doc) >= 0) {
				isTopLevel = true;
			}
			
			// Add listener to all docs -- top-level, frames, iframes, etc.
			if (isDOMContentLoadedEvent) {
				// Links can be clicked before the page is finished loading
				doc.addEventListener("click", document_onclick, true);
				doc.addEventListener("mousedown", function(e) {
					log_write("document_mousedown", {"which":e.which, "ctrlKey":e.ctrlKey, 
						"shiftKey":e.shiftKey, "altKey":e.altKey, "metaKey":e.metaKey});
				}, true);

				if (globals.firefoxMajorVersion == 2) {
					hookFormSubmit(doc, isTopLevel);
					hookJavascriptNavigation(doc, isTopLevel);
				}
			}

			var browser = gBrowser.browsers[tab._tPos];
			var tabId = getTabId(tab);

			// The DOMContentLoaded event happens as soon as the page as laid out,
			// but before all images are loaded, etc. The actual "load" event is later.

			if (isTopLevel && isDOMContentLoadedEvent) {
				
			} else {
				log_write("load", {"tabIndex":tab._tPos, "tabId":tabId, 
					"url":obf_url(doc.URL), "isTopLevel":isTopLevel});
			
				var xml_dom = readLog();
			
				// get or create tab
				var log_tab = jQuery("#" + tabId, xml_dom);
				
				// update all the nonexisting page_titles
				var pages_without_title = jQuery("page:not([page_title])", xml_dom);
				
				if (pages_without_title.length > 0) {
					pages_without_title.each(function (i) {
						var page = jQuery(this);
						var tab_id = page.parent().attr('id');
						page.attr("page_title", getTabLabel(tab_id));
					});
					writeLog(xml_dom);
					LOG(pages_without_title.length + " page title(s) updated and written to XML");
				}
				
				if (log_tab.length == 0) {
					alert("handleLoadEvent: Expected tab, with ID " + tabId + "doesn't exist!");
			  
				} else if (tabId == getTabId(gBrowser.selectedTab)) { //Tget it to show the first tab opened on restore/load as viewed.
						jQuery("#" + tabId, xml_dom).attr("status", "viewed");
					
						// write XML to file
						writeLog(xml_dom);
						LOG("marked tab:" + tabId + " as viewed and wrote to XML");
				}
				
			}
		}
	} catch(ex) {
		log_error("Exception in handleLoadEvent", ex);
	}
}

// This object handles session history events. i.e., back or forward events,
// and selection of the session history (drop-down menu from back/forward buttons)
// This does NOT handle events in the history sidebar -- see history.[js,xul]

var historyListener = {
	// This is a required method from nsIWeakReference
	QueryInterface: function (aIID) {
	   if (Ci.nsISupports.equals(aIID) ||
		  Ci.nsISupportsWeakReference.equals(aIID) ||
		  Ci.nsISHistoryListener.equals(aIID))
		  return this;
			
	   throw Components.results.NS_NOINTERFACE;
	},

	OnHistoryGoBack: function (backURI) {
		try {
			log_write("OnHistoryGoBack", {"url":obf_url(backURI.spec)});
		} catch(ex) {
			log_error("Exception in OnHistoryGoBack", ex);
		}
		return true;
	},

	OnHistoryGoForward: function (forwardURI) {
		try {
			log_write("BrowserForward", {"url":obf_url(forwardURI.spec)});
		} catch(ex) {
			log_error("Exception in OnHistoryGoForward", ex);
		}
		return true;
	},

	OnHistoryGotoIndex: function (index, gotoURI) {
		try {
			log_write("gotoHistoryIndex", {"index":index, "url":obf_url(gotoURI.spec)});
		} catch(ex) {
			log_error("Exception in OnHistoryGotoIndex", ex);
		}
		return true;
	},

	OnHistoryNewEntry: function (newURI) { },

	OnHistoryPurge: function (numEntries) {
		return true;
	},
	
	OnHistoryReload: function (reloadURI, reloadFlags) {
		try {
			log_write("OnHistoryReload", {"url":obf_url(reloadURI.spec)});
		} catch(ex) {
			log_error("Exception in OnHistoryReload", ex);
		}
		return true;
	}
};
weakListeners.push(historyListener);


// create and add history observer
var historyChangeObserver = {
	onBeginUpdateBatch: function() {},
	onEndUpdateBatch: function() {},
	onVisit: function(aURI, aVisitID, aTime, aSessionID, aReferringID, aTransitionType) {
		try {
			if (aTransitionType == Ci.nsINavHistoryService.TRANSITION_BOOKMARK) {
				log_write("bookmark_visit", {"url":obf_url(aURI.spec)});
			}
		} catch(ex) {
			log_error("Exception in historyChangeObserver.onVisit", ex);
		}
	},
	onTitleChanged: function(aURI, aPageTitle) {},
	onDeleteURI: function(aURI) {},
	onClearHistory: function() {},
	onPageChanged: function(aURI, aWhat, aValue) {},
	onPageExpired: function(aURI, aVisitTime, aWholeEntry) {},
	QueryInterface: function(iid) {
		if (iid.equals(Ci.nsINavHistoryObserver) || iid.equals(Ci.nsISupports)) {
			return this;
		}
		throw Cr.NS_ERROR_NO_INTERFACE;
	}
};
weakListeners.push(historyChangeObserver);


function takeScreenshot(log_args) {
	try {
		var timestamp = getCurrentTimeMillis();
		var xml_dom = readLog();
		// get the last page in the selected tab
		var page = jQuery("#" + log_args["tabId"] + " > page:last", xml_dom);
		LOG("Taking screenshot of tab:" + log_args["tabId"] + " with page attr for time: " + page.attr("time") + " title: " + page.attr("page_title"));
		
		//**********New stuff
		var b = getBrowser();
		var win = b.getBrowserForTab(gBrowser.selectedTab).contentWindow; 
	 	//alert("tab:" + gBrowser.selectedTab + "window: " + win);	
	 	
	 	//Create a new (hidden) canvas element in the tree
	 	var canvas = document.createElement("canvas"); 
	 	canvas.style.width="200px";
	 	canvas.style.height="200px";
	 	canvas.width=200;
	 	canvas.height=200;
      	
      	var ctx = canvas.getContext("2d"); 	 	//this doesn't work, but why?
      	
//      	ctx.clearRect(0, 0, 200, 200); //x,y,w,h
//      	ctx.save();
//          ctx.scale(canvasW/w, canvasH/h);
//	        ctx.drawWindow(win, xScroll, yScroll, w, h+fudge, "rgb(255,255,255)");
//
//      var savefile="screenshottest.png"; //obviously needs to be customized for tabviz.  Will save at top level of the firefox profile directory currently.
//      try {
//			netscape.security.PrivilegeManager.enablePrivilege("UniversalXPConnect");
//			} catch (e) {
//				alert("Permission to save file was denied.");
//			}
//			// get the path to the user's home (profile) directory
//			const DIR_SERVICE = new Components.Constructor("@mozilla.org/file/directory_service;1","nsIProperties");
//			try { 
//				path=(new DIR_SERVICE()).get("ProfD", Components.interfaces.nsIFile).path; 
//			} catch (e) {
//				alert("error");
//			}
//			// determine the file-separator
//			if (path.search(/\\/) != -1) {
//				path = path + "\\";
//			} else {
//				path = path + "/";
//			}
//			savefile = path+savefile;
//			saveCanvas(ctx.canvas, savefile); 
//          ctx.restore();

//*************
		
		var filename = page.attr("time") + "." + org_screengrab.Screengrab.format();
		var nsIFile = globals.getScreenshotDirFile(filename, false);
		
		org_screengrab.Screengrab.grabViewportToFile(nsIFile);
		
		log_args["path"] = nsIFile.path;
		log_write("screenshot", log_args);
	} catch(ex) {
		log_error("Exception while taking screenshot", ex);
	}
}



function searchForSite(exact)
{
	try {
		var str = prompt("Enter string to search for:");
		if (str) {
			var matches = globals.stringTable.search(str);
			var hostnames = [];
			for each (var hit in matches) {
				// Check if the hit looks like a hostname
				if (hit[0].match(/^\w+([\.-]?\w+)*(\.\w{2,3})+$/)) {
					hostnames.push(hit);
				}
			}
		
			if (hostnames.length == 0) {
				alert("No matches found.");
			} else {
				var result = " Results:  \n";
				for each (var hit in hostnames) {
					result += '   "' + hit[0] + '":"' + hit[1] + '"  \n';
				}
				alert(result);
			}
		}
	} catch(ex) {
		log_error("Error in searchForSite", ex);
		alert("Oops! An error occurred:\n" + ex.toString());
	}
}

//----------------------------------------------------------------------------
// Tabviz
//----------------------------------------------------------------------------

// opens/selects the tab with the passed in tabId
function openTab(tabId) {
	var tContainer = jQuery(gBrowser.tabContainer);
	tContainer.children().each(function (i) {	
		if(getTabId(this) == tabId) {
			gBrowser.selectedTab = this;
			var tabviz = jQuery("#tabviz", window.content.document);
			if (tabviz.length > 0) tabviz.remove();
			appendViz();
		}
	});
}

// return the tab with the passed in tabId
function getTabLabel(tabId) {
	var label = ""
	var tContainer = jQuery(gBrowser.tabContainer);
	tContainer.children().each(function (i) {
		if(getTabId(this) == tabId) {
			label = this.label;
		}
	});
	return label;
}

// writes tab even to the xml log file
function writeLog(xml_dom) {
	var serializer = new XMLSerializer();
	var foStream = Components.classes["@mozilla.org/network/file-output-stream;1"]
	               .createInstance(Components.interfaces.nsIFileOutputStream);
	var file = Components.classes["@mozilla.org/file/directory_service;1"]
	           .getService(Components.interfaces.nsIProperties)
	           .get("ProfD", Components.interfaces.nsIFile); // get profile folder
	file.append("tabviz");
	file.append("open_tabs.xml");
	foStream.init(file, 0x02 | 0x08 | 0x20, 0664, 0);   // write, create, truncate
	serializer.serializeToStream(xml_dom, foStream, "");
	foStream.close();
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

// Code below here is run when the browser.xul overlay is loaded
try {

	var loader = window.Cc["@mozilla.org/moz/jssubscript-loader;1"]
		.getService(Ci.mozIJSSubScriptLoader);
	loader.loadSubScript("chrome://tabviz/content/Screengrab.js")

	window.addEventListener("load", window_onload, false);
	window.addEventListener("unload", window_onunload, false);
	
	// get profile directory
	var file = Components.classes["@mozilla.org/file/directory_service;1"].getService(Components.interfaces.nsIProperties).get("ProfD", Components.interfaces.nsIFile);
	file.append("tabviz");
	if( !file.exists() || !file.isDirectory() ) {   // if it doesn't exist, create
	   file.create(Components.interfaces.nsIFile.DIRECTORY_TYPE, 0777);
	}
	// create/truncate XML file
	var defautl_xml_string = '<?xml version="1.0" encoding="UTF-8"?><open_tabs></open_tabs>';
	var foStream = Components.classes["@mozilla.org/network/file-output-stream;1"]
               .createInstance(Components.interfaces.nsIFileOutputStream);
	file.append("open_tabs.xml");
	foStream.init(file, 0x02 | 0x08 | 0x20, 0664, 0);   // write, create, truncate
	foStream.write(defautl_xml_string, defautl_xml_string.length);
	foStream.close();
	
	
	// An evil hack, but necessary in order to be compatible with TabMixPlus
	eval("openNewTabWith = " + openNewTabWith.toString().replace(
			"{", 
			"{ com_dubroy_tlogger.window_openNewTabWith(arguments[0], arguments[1]); "));
	eval("openNewWindowWith = " + openNewWindowWith.toString().replace(
			"{", 
			"{ com_dubroy_tlogger.window_openNewWindowWith(arguments[0], arguments[1]); "));
} catch(ex) {
	log_error("Exception in extension body", ex);
}

var public_attributes = {

	"rightClickedLink": rightClickedLink,

	"openedNewWindow": openedNewWindow,

	"openedNewTab": openedNewTab,

	"log_write": log_write,
	"obf_url": obf_url,
	"weakListeners": weakListeners,
	"window_openNewTabWith": window_openNewTabWith,

	"window_openNewWindowWith": window_openNewWindowWith,
	"searchForSite": searchForSite,
	
	"openTab": openTab,
	"getTabId": getTabId
};

return public_attributes;

}();

function saveCanvas(canvas, destFile) {
  // convert string filepath to an nsIFile
  var file = Components.classes["@mozilla.org/file/local;1"]
                       .createInstance(Components.interfaces.nsILocalFile);
  file.initWithPath(destFile);

  // create a data url from the canvas and then create URIs of the source and targets  
  var io = Components.classes["@mozilla.org/network/io-service;1"]
                     .getService(Components.interfaces.nsIIOService);
  var source = io.newURI(canvas.toDataURL("image/png", ""), "UTF8", null);
  var target = io.newFileURI(file)
    
  // prepare to save the canvas data
  var persist = Components.classes["@mozilla.org/embedding/browser/nsWebBrowserPersist;1"]
                          .createInstance(Components.interfaces.nsIWebBrowserPersist);
  
  persist.persistFlags = Components.interfaces.nsIWebBrowserPersist.PERSIST_FLAGS_REPLACE_EXISTING_FILES;
  persist.persistFlags |= Components.interfaces.nsIWebBrowserPersist.PERSIST_FLAGS_AUTODETECT_APPLY_CONVERSION;
  
  // displays a download dialog (remove these 3 lines for silent download)
  var xfer = Components.classes["@mozilla.org/transfer;1"]
                       .createInstance(Components.interfaces.nsITransfer);
  xfer.init(source, target, "", null, null, null, persist);
  persist.progressListener = xfer;
  
  // save the canvas data to the file
  persist.saveURI(source, null, null, null, null, file);
}