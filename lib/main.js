let { components, Cu } = require("chrome");

require("./chrome-protocol").register("obj-tracker", require("sdk/self").data.url());

/////////////////////////
// Register the mem panel
let toolbox = require("./toolbox");
let Promise = require("sdk/core/promise");

toolbox.register({
  id: "mem-panel",
  url: "obj-tracker://index.xul",
  label: "Mem panel",
  tooltip: "Memory inspection tool",
  build: build
});

//////////////////////////////////
// Analyse memory on panel opening
const inspect = require("./js-inspect");
const jsapi = require("./jsapi");
const { CCAnalyzer } = require("cc-analyzer");
let processing = false;
function build(iframeWindow, toolbox) {
  if (processing) return;
  processing = true;
  iframeWindow.wrappedJSObject.update = build.bind(null, iframeWindow, toolbox);
  var container = iframeWindow.document.getElementById("root");
  container.innerHTML = "<b>Processing memory...</b>";
  // Get a JSContext instance
  inspect.getEnv(function (rt, cx) {
    // Get a full CC graph in order to start mem analysis
    let analyzer = new CCAnalyzer(true);
    analyzer.run(function () {
      lookForMagicObject(iframeWindow.wrappedJSObject, cx, analyzer);
      processing = false;
    });
  });
}

function lookForMagicObject(iframeWindow, cx, analyzer) {
  // Search for magic object by finding the edge
  // with the `magicId` name which is the attribute name
  // on magic object that refers to the `trackedObjects` array
  var classes={};
  for (var i in analyzer.graph) {
    let o = analyzer.graph[i];

    if (o.name != "JS Object (Object)")
      continue;
    o.edges.some(function (e) {
      if (e.name == magicId) {
        analyzeTrackedObjects(iframeWindow, cx, analyzer, e.to);
        return true;
      }
    });
  }
  
}
function analyzeTrackedObjects(iframeWindow, cx, analyzer, trackedObjects) {
  // Now, `trackedObjects` is an array of wrappers, So unwrapped
  // them before try to print information on tracked objects
  let elements = trackedObjects.edges.filter(function (e) {
    return !!e.name.match(/objectElements\[(\d+)\]/);
  });
  let i = 0;
  let result = elements.map(function (e) {
    return dumpObject(cx, unwrap(e.to), false, e.to,
                      trackedMetadata[i++]);
  });
  iframeWindow.updateObjectList(result);
}
function unwrap(o) {
  let target = null;
  o.edges.some(function (e) {
    if (e.name == "private") {
      target = e.to;
      return true;
    }
  });
  return target;
}
function getEdgeFromEdgeName(obj, name) {
  for (let i = 0; i < obj.edges.length; i++) {
    let e = obj.edges[i];
    if (e.name == name)
      return e.to;
  }
}
function getOwnerFromEdgeName(obj, name) {
  for (let i = 0; i < obj.owners.length; i++) {
    let e = obj.owners[i];
    if (e.name == name)
      return e.from;
  }
}
function dumpObject(cx, o, dumpEdges, wrapper, metadata) {
  let owners = o.owners.filter(function (e) {
    // Avoid showing the wrapper that is automatically builds when we 
    // add a content object into trackedObjects array
    return e.from !== wrapper;
  }).map(function (e) {
    let kind;
    if (e.from.name == "JS Object (Call)") {
      kind = "scope";
      data = dumpScope(cx, e.from, e.name);
    }
    else {
      kind = "generic";
      data = e.from.name;
    }
    return {
      name: e.name,
      kind: kind,
      data: data
    };
  });
  return {
    name: o.name,
    filename: metadata.stack.filename,
    line: metadata.stack.line,
    owners: owners
  };
}
function dumpScope(cx, o, varname) {
  let fun = getOwnerFromEdgeName(o, "fun_callscope");
  let parent = getEdgeFromEdgeName(o, "parent");
  let binded = false;
  if (parent && parent.name.indexOf("JS Object (Function") == 0) {
    binded = true;
    fun = parent;
  }
  let obj = jsapi.getPointerForAddress(fun.address);
  return {
    binded: binded,
    varname: varname,
    source: jsapi.stringifyFunction(cx, obj)
  };
}

////////////////////////////////////
// Inject `mem` in content documents
const systemEvents = require('sdk/system/events');
const unload = require("sdk/system/unload");

function onContentWindow(event) {
  let document = event.subject;
  if (!document.defaultView)
    return;
  let window = document.defaultView;
  if ("mem" in window.wrappedJSObject)
    return;
  let mem = Cu.createObjectIn(window);
  Object.defineProperties(mem, {
    track: {
      value: track
    }
  });
  Cu.makeObjectPropsNormal(mem);
  window.wrappedJSObject.mem = mem;
}

systemEvents.on('document-element-inserted', onContentWindow, true);
unload.when(function () {
  systemEvents.off('document-element-inserted', onContentWindow);
});

////////////
// "mem" API
let magicId = "magic-" + Math.random();
let trackedObjects = [];
let magicObject = {};
magicObject[magicId] = trackedObjects;
let trackedMetadata = [];
function track(obj) {
  if (trackedObjects.indexOf(obj) == -1) {
    trackedObjects.push(obj);
    let frame = components.stack.caller;
    trackedMetadata.push({
      stack: {
        filename: frame.filename,
        line: frame.lineNumber
      }
    });
  }
}


/////////////////////////
// Open the toolbox panel
function openToolbox() {
  let { gDevToolsBrowser } = Cu.import("resource:///modules/devtools/gDevTools.jsm", {});
  let { TargetFactory } = Cu.import("resource:///modules/devtools/Target.jsm", {});
  let { gBrowser } = require("sdk/window/utils").getMostRecentBrowserWindow();
  gDevToolsBrowser.selectToolCommand(gBrowser, "mem-panel" + require("sdk/self").id);
}

///////////////////
// Open a test case
let tabs = require("sdk/tabs");
tabs.open({
  url: require("sdk/self").data.url("leak.html"),
  onReady: openToolbox
});
