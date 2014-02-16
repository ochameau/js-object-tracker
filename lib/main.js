const { components, Cu, Cc, Ci } = require("chrome");
const { setTimeout, setInterval } = require("sdk/timers");
const memapi = require("./memapi");

// Register custom priviledged protocol to load xul document
require("./chrome-protocol").register("obj-tracker", require("sdk/self").data.url());

(function DisableDeadProxy() {
  let window = require("sdk/window/utils").getMostRecentBrowserWindow();
  let aboutBlankWindow = window.content;
  let {gBrowser} = window;
  gBrowser.selectedTab = gBrowser.addTab();

  gBrowser.addEventListener("DOMContentLoaded", setDead, false);
  window.content.location = "data:text/html,foo";

  function setDead() {
    gBrowser.removeEventListener("DOMContentLoaded", setDead, false);
    aboutBlankWindow.wrappedJSObject.deadRef1 = window.content.wrappedJSObject;
    window.content.wrappedJSObject.deadRef2 = aboutBlankWindow.wrappedJSObject;
    let w = window.content;
    gBrowser.fooo = w;
    setInterval(function () {
      console.log("ok", w.location.href);
    }, 1000);
  }
  window.chromeDeadRef = aboutBlankWindow.wrappedJSObject;
});

/*
let listener = Cc["@mozilla.org/cycle-collector-logger;1"].
  createInstance(Ci.nsICycleCollectorListener);
let window = require("sdk/window/utils").getMostRecentBrowserWindow();
listener.enableAllocationMetadata(window);
listener.traceZone(window);
console.log("DEAD WRAPPER: " + listener.deadWrapperAddress);

var a = {};

try {
  let f = [];
  setInterval(function () {
    f.push({foo:"bar"});
  }, 2000);
}catch(e) {
  console.log("ex: "+e);
}

listener.disableAllocationMetadata(this);
const { CCAnalyzer } = require("cc-analyzer");
let analyzer = new CCAnalyzer(true);
analyzer.run(function () {
  console.log("Fetched all CC", Object.keys(analyzer.graph).length);
});
*/

/////////////////////////
// Register the mem panel
let toolbox = require("./toolbox");
let Promise = require("sdk/core/promise");
let {devtools} = Cu.import("resource://gre/modules/devtools/Loader.jsm");
let req = devtools.require;
let {MemoryFront} = req("devtools/server/actors/memory-alex");

toolbox.register({
  id: "mem-panel",
  url: "obj-tracker://index.xul",
  label: "Mem panel",
  tooltip: "Memory inspection tool",
  build: function (frame, toolbox) {
    console.log("build");
    try {
      let target = toolbox.target;
      let client = target.client;
      let form = target.form;
      console.log("build args", target, client, form);
      let front = MemoryFront(client, form);
      console.log("front", front);
      frame.wrappedJSObject.start = function () {
        console.log("start", front.start());
      };
      frame.wrappedJSObject.stop = function () {
        console.log("stop", front.stop());
      };
      frame.wrappedJSObject.getProfile = function () {
        console.log("getProfile");
        front.getProfile().then(function ({profile}) {
          console.log("profile", profile);
          try {
            /*
            let list = [];
            for (let type in objects) {
              list.push({name: type, count: objects[type]});
            }
            list.sort((a, b) => (a.count < b.count));
            list = list.map((o) => (o.count + " " + o.name));
            */
            let root = frame.document.getElementById("root");
            let pre = frame.document.createElement("pre");
            pre.setAttribute("style", "white-space: pre; -moz-user-select: auto;");
            pre.textContent = JSON.stringify(profile, null, 2);
            root.innerHTML = "";
            root.appendChild(pre);
            console.log("ok");
          } catch(e) {
            console.log("ex: " + e, e);
          }
        });
      };
    } catch(e) {
      console.log("exception: " + e, e, e.stack);
    }
    return {destroy: function () {}};
  }
});

function disabled() {




function doUpdate(iframeWindow, view) {

  // Get a JSContext instance
  //inspect.getEnv(function (rt, cx) {
    let rt, cx;
    iframeWindow.wrappedJSObject.getObjectDescription = getObjectDescription.bind(null, cx);
    iframeWindow.wrappedJSObject.getObjectTitle = getObjectTitle.bind(null, cx);

    // Get a full CC graph in order to start mem analysis
    let wholeCC = view !== "cc-fragments" && view !== "cc-js-fragments";
    let analyzer = new CCAnalyzer(wholeCC);
    analyzer.run(function () {
      if (view == "tracked")
        lookForMagicObject(cx, analyzer, done);
      else if (view == "snapshots")
        dumpSnapshot(cx, analyzer, done);
      else if (view == "dead")
        lookForDeadWrappers(cx, analyzer, done);
      else if (view == "cc-js-fragments")
        dumpCCFragments(cx, analyzer, true, done);
      else if (view == "cc-fragments")
        dumpCCFragments(cx, analyzer, false, done);
    });
    function done(list) {
      processing = false;
      delete magicObject[magicId];

      iframeWindow.wrappedJSObject.updateObjectList(analyzer, list);
    }
  //});  
}

function getFirstJSObjectOwner(visited, o, path) {
  if (visited[o.key])
    return;
  visited[o.key] = true;

  // Breadth-first search. Search in current object owners first,
  // before recursing on them
  for (var i = 0; i < o.owners.length; i++) {
    let edge = o.owners[i];
    //XXX: ignore these unknown slot edge.
    // they seem to be duplicate in JS OBject (Call) of other edges
    // with more meaningfull names...
    if (edge.name.match(/\*\*UNKNOWN SLOT \d+\*\*/))
      continue;
    let owner = edge.from;
    if (owner.name.match(/JS Object \((Object|Proxy|Call|Function)\s*\)/)) {
      path.push({edgeName: o.owners[i].name, owner: owner});
      return owner;
    }
  }

  for (var i = 0; i < o.owners.length; i++) {
    let owner = o.owners[i].from;
    path.push({edgeName: o.owners[i].name, owner: owner});
    let jsobj = getFirstJSObjectOwner(visited, owner, path);
    if (jsobj)
      return jsobj;
    path.pop();
  }
}

function dumpCCFragments(cx, analyzer, searchJSObjects, done) {
  // Get Fragment list in the optimized CC list
  let list = [];
  for (let i in analyzer.graph) {
    let o = analyzer.graph[i];
    if (o.name.indexOf("FragmentOrElement") == 0)
      list.push(o);
  }

  // Then get the whole CC graph in order to get all edges
  let analyzer2 = new CCAnalyzer(true);
  analyzer2.run(function () {
    // Convert the fragment list from the optimized CC graph to the complete one
    list = list.map(function (o) {
      return analyzer2.graph[o.key];
    });

    if (searchJSObjects) {
      // Translate this list to the first JS OBject owner we may eventually find
      list = list.reduce(function (jsobjects, o) {
        let path = [];
        let jsobj = getFirstJSObjectOwner({}, o, path);
        if (jsobj && jsobjects.indexOf(jsobj) == -1) {
          jsobj.pathToFragment = path.reverse();
          jsobj.edgeName = path[0].edgeName;
          jsobjects.push(jsobj);
        }
        return jsobjects;
      }, []);
    }

    // Remove elements owned by any other element of this list
    list = list.filter(function (o) {
      let owned = o.owners.some(function (e) {
        return list.indexOf(e.from) != -1 && e.from != o;
      });
      return !owned;
    });

    done(list);
  });
}

function lookForDeadWrappers(cx, analyzer, done) {
  let deads = [];
  for (let i in analyzer.graph) {
    let o = analyzer.graph[i];
    if (o.name == "JS Object (Proxy)") {
      if (jsapi.JS_IsDeadWrapper(jsapi.getPointerForAddress(o.address))) {
        deads.push(o);
      }
    }
  }
  done(deads);
}

function dumpSnapshot(cx, analyzer, done) {
  let newObjects = memapi.getSnapshotObjects();
  let objects = [];
  for each (let address in newObjects) {
    if (address in analyzer.graph)
      objects.push(analyzer.graph[address]);
    else
      console.log("Object freed since the snapshot??");
  }
  done(objects);
}

let magicObject = {};
let magicId = "magic-" + Math.random();
function setMagicObject() {
  // Set an attribute with a unique attribute name
  // so that we can easily identify our object array in the CC graph
  // by looking for an edge with same unique name
  magicObject[magicId] = memapi.getTrackedObjects().map(function (o) {
    // Temporary get strong references to objects,
    // in order to be able to have an edge to them.
    // (weakref object don't store edge to the target object)
    return o.get();
  });
}
function lookForMagicObject(cx, analyzer, done) {
  // Search for magic object by finding the edge
  // with the `magicId` name which is the attribute name
  // on magic object that refers to the `trackedObjects` array
  for (var i in analyzer.graph) {
    let o = analyzer.graph[i];
    if (o.name != "JS Object (Object)")
      continue;
    if (o.edges.some(function (e) {
      if (e.name == magicId) {
        let trackedObjects = e.to;
        // Eventually unwrap the array as it comes from another sandbox,
        // and can be a wrapper
        trackedObjects = unwrap(e.to);
        analyzeTrackedObjects(cx, analyzer, trackedObjects, done);
        return true;
      }
    }))
      return;
  }
  console.error("Unable to find magic object");
}
function analyzeTrackedObjects(cx, analyzer, trackedObjects, done) {
  // Now, `trackedObjects` is an array of wrappers, So unwrapped
  // them before trying to print information on tracked objects
  let elements = trackedObjects.edges.filter(function (e) {
    // get only array elements
    return !!e.name.match(/objectElements\[(\d+)\]/);
  }).map(function (e) {
    // get edges target object
    return e.to;
  });
  
  let result = elements.map(function (o, i) {
    // unwrap wrappers
    let obj = unwrap(o);
    // Set some additional data to the object given to the view
    let metadata = memapi.getObjectMetadata(i++);
    obj.location = metadata.location;
    // We have to ignore the edge from `magicObject[magicId]` to our tracked object
    obj.owners = obj.owners.filter(function (e) {
      return e.from !== o;
    })
    return obj;
  });
  done(result);
}

function unwrap(o) {
  if (o.name != "JS Object (Proxy)")
    return o;
  return getEdgeFromEdgeName(o, "private");
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
function getEdgesFromEdgeName(obj, name) {
  return obj.edges.filter(function (e) {
    return e.name == name;
  }).map(function (e) {
    return e.to;
  });
}
function getOwnersFromEdgeName(obj, name) {
  return obj.owners.filter(function (e) {
    return e.name == name;
  }).map(function (e) {
    return e.from;
  });
}

function getObjectTitle(cx, o, edgeName) {
  if (o.name == "JS Object (Call)") {
    // JS OBject (Call) <-- fun-callscope -- JS Object (Function)
    let fun = getOwnerFromEdgeName(o, "fun_callscope");
    if (fun) {
      let m = fun.name.match(/Function - (\w+)\)/);
      if (m)
        return "Scope of function:" + m[1] +
               (edgeName ? ", var:" + edgeName : "");
    }
    return "Scope";
  }
  
  if (o.name == "nsXPCWrappedJS (nsIDOMEventListener)") {
    // nsXPCWrappedJS (nsIDOMEventListener) <-- mListeners[i] -- nsEventListenerManager
    // <-- [via hash] mListenerManager -- FragmentOrElement
    let listenerManagers = getOwnersFromEdgeName(o, "mListeners[i]");
    let fragments = listenerManagers.reduce(function (list, manager) {
      return list.concat(manager.owners.map(function (e) e.from));
    }, []);
    fragments = fragments.map(getObjectTitle.bind(null, cx));
    return "Set as listener on (" + fragments + ")";
  }
  if (o.name == "JS Object (Proxy)") {
    // JS Object (Proxy) -- private --> *
    let wrappedObject = unwrap(o);
    if (wrappedObject)
      return "Wrapper for " + getObjectTitle(cx, wrappedObject);
    else
      return "Dead wrapper";
  }
  if (o.name == "JS Object (Object)") {
    return "JS Object";
  }
  if (o.name == "JS Object (Function)") {
    return "Anonymous function";
  }
  let m = o.name.match(/JS Object \((XUL\w+)\)/);
  if (m)
    return m[1];
  let m = o.name.match(/JS Object \(Function - (\w+)\)/);
  if (m)
    return "Function " + m[1];
  return o.name;
}

function getEdgePrettyName(obj, edgeName, target) {
  if (obj.name.indexOf("JS Object") == 0) {
    if (edgeName == "parent")
      return "Global object";
    if (edgeName == "type_proto")
      return "prototype";
  }
  return edgeName;
}

function getObjectDescription(cx, target, edgeName) {
  var data;
  if (target.name == "JS Object (Call)") {
    kind = "scope";
    data = dumpScope(cx, target, edgeName);
  }
  else {
    kind = "generic";
  }
  return {
    object: target,
    name: edgeName,
    kind: kind,
    data: data
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
  let variables = o.edges.filter(function (e) {
    return !e.name.match(/parent|UNKNOWN SLOT/);
  });
  variables = variables.map(function (e) {
    return {name: e.name, target: e.to};
  });
  //let obj = jsapi.getPointerForAddress(fun.address);
  return {
    binded: binded,
    varname: varname,
    variables: variables,
    source: "[source]"//jsapi.stringifyFunction(cx, obj)
  };
}

/////////////////////////
// Open the toolbox panel
function openToolbox() {
  let { gDevToolsBrowser } = Cu.import("resource:///modules/devtools/gDevTools.jsm", {});
  let { gBrowser } = require("sdk/window/utils").getMostRecentBrowserWindow();
  gDevToolsBrowser.selectToolCommand(gBrowser, "mem-panel" + require("sdk/self").id);
}


///////////////////
// Open a test case
let tabs = require("sdk/tabs");
tabs.open({
  url: require("sdk/self").data.url("leak.html")
});


}
