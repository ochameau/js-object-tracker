const { components, Cu } = require("chrome");

////////////
// "mem" API
const trackedObjects = [];
const trackedMetadata = [];
function track(obj) {
  // Keep a weak ref to this object
  let weak = Cu.getWeakReference(obj);
  trackedObjects.push(weak);

  // And also store some additional metadata
  let frame = components.stack.caller;
  trackedMetadata.push({
    location: {
      filename: frame.filename,
      line: frame.lineNumber
    }
  });
}
const MAGIC_KEY = "magic-" + Math.random();
const { CCAnalyzer } = require("cc-analyzer");
const snapshots = [];

function snap(caller) {
  let done = false, onDone;

  // Retrieve the global object of the caller.
  // For chrome, we have to pass an object as this won't be an object from the
  // caller, but Services.mem, set later in this module
  let global = Cu.getGlobalForObject(caller || this);
  // Flag the global object of the caller in order to only care about objects
  // from this compartment
  if (global.wrappedJSObject)
    global.wrappedJSObject[MAGIC_KEY] = {};
  else
    global[MAGIC_KEY] = {};

  // Force some GC in order to avoid listing object that are meant to be freed

  
  let analyzer = new CCAnalyzer(true);
  analyzer.run(function () {
    console.log("# firefox object= "+Object.keys(analyzer.graph).length);
    // First try to find out flagged global object
    let global = null;
    for (let i in analyzer.graph) {
      let o = analyzer.graph[i];
      let hasMagicAttribute = o.edges.some(function (e) {
        return e.name == MAGIC_KEY;
      });
      if (hasMagicAttribute) {
        global = o;
        break;
      }
    }
    if (!global) {
      console.log("Unable to find the global???");
      return;
    }

    // Then compute the list of all interesting objects for this compartment
    let objects = {};
    function markObject(obj) {
       if (obj.address in objects)
          return;
      objects[obj.address] = {address: obj.address, name: obj.name};
      for (let i in obj.edges) {
        let o = obj.edges[i].to;
        if (o.address in objects)
          continue;
        if (o.name.indexOf("JS Object") == 0 && o.name != "JS Object (Proxy)")
          markObject(o);
      }
    }
    markObject(global);

    snapshots.push(objects);
    console.log("#DONE");
    
    console.log("# compartment object= "+Object.keys(objects).length);
    
    if (snapshots.length == 2) {
      let [a, b] = snapshots;
      let newObjects = [];
      for (let i in b) {
        let o = b[i];
        if (!(o.address in a))
          newObjects.push(o);
      }
      console.log("# new objects= "+newObjects.length);
    }
    
    if (global.wrappedJSObject)
      delete global.wrappedJSObject[MAGIC_KEY];
    else
      delete global[MAGIC_KEY];

    if (onDone)
      onDone();
    done = true;
  }, false);
  
  return {
    then: function (f) {
      if (done) f();
      else onDone = f;
    },
    __exposedProps__: {
      "then": "r"
    }
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
  // Only inject if not already existing
  if ("mem" in window.wrappedJSObject)
    return;
  let mem = Cu.createObjectIn(window);
  Object.defineProperties(mem, {
    track: {
      value: track
    },
    snap: {
      value: snap
    },
    __exposedProps__: {
      value: {
        "track": "r",
        "snap": "r"
      }
    }
  });
  Cu.makeObjectPropsNormal(mem);
  window.wrappedJSObject.mem = mem;
}

systemEvents.on('document-element-inserted', onContentWindow, true);
unload.when(function () {
  systemEvents.off('document-element-inserted', onContentWindow);
});

/////////////////////////////////////////////////////////
// Expose mem API to chrome code, by hacking Services.jsm
const { Services } = Cu.import('resource://gre/modules/Services.jsm', {});
Services.mem = {
  track: track,
  snap: snap
};

exports.getTrackedObjects = function () {
  return trackedObjects;
}

exports.getObjectMetadata = function (i) {
  return trackedMetadata[i];
}

exports.getSnapshotObjects = function () {
  if (snapshots.length < 2)
    return [];
  // Get last two snapshots
  let a = snapshots[snapshots.length-2];
  let b = snapshots[snapshots.length-1];
  let newObjects = [];
  for (let i in b) {
    let o = b[i];
    if (!(o.address in a))
      newObjects.push(o.address);
  }
  console.log("returned new objects: "+newObjects.length);
  return newObjects;
}