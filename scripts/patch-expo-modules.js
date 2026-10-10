const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else {
      results.push(file);
    }
  });
  return results;
}

const baseDir = path.join(__dirname, '..', 'node_modules', 'expo-modules-jsi');

// 1. Patch Task+immediate.swift (standard Task init without unsupported name: parameter)
const taskImmediateFile = path.join(baseDir, 'apple', 'Sources', 'ExpoModulesJSI', 'Extensions', 'Task+immediate.swift');
if (fs.existsSync(taskImmediateFile)) {
  const content = `// Polyfill for Task.immediate
extension Task where Failure == any Error {
  @discardableResult
  public static func immediate_polyfill(
    name: String? = nil,
    priority: TaskPriority? = nil,
    @_inheritActorContext @_implicitSelfCapture operation: sending @escaping @isolated(any) () async throws -> Success
  ) -> Task<Success, any Error> {
    return Task(priority: priority ?? .high, operation: operation)
  }
}
`;
  fs.writeFileSync(taskImmediateFile, content, 'utf8');
  console.log('[patch] Replaced Task+immediate.swift');
}

// 2. Patch HostObjectCallbacks.h with appendPropNameForUtf8 C++ helper
const hostCallbacksFile = path.join(baseDir, 'apple', 'Sources', 'ExpoModulesJSI-Cxx', 'include', 'HostObjectCallbacks.h');
if (fs.existsSync(hostCallbacksFile)) {
  let hcContent = fs.readFileSync(hostCallbacksFile, 'utf8');
  if (!hcContent.includes('appendPropNameForUtf8')) {
    hcContent = hcContent.replace('#include "RetainedSwiftPointer.h"', '#include "RetainedSwiftPointer.h"\n#include "IRuntimeCompat.h"');
    const helperCode = `
inline void appendPropNameForUtf8(std::vector<facebook::jsi::PropNameID> &vector, facebook::jsi::IRuntime &runtime, const char *_Nonnull utf8) {
  vector.push_back(facebook::jsi::PropNameID::forUtf8(runtime, utf8));
}
} // namespace expo`;
    hcContent = hcContent.replace('} // namespace expo', helperCode);
    fs.writeFileSync(hostCallbacksFile, hcContent, 'utf8');
    console.log('[patch] Added appendPropNameForUtf8 in HostObjectCallbacks.h');
  }
}

// 3. Patch RuntimeScheduler.h with static create factory methods and global retain/release
const runtimeSchedulerFile = path.join(baseDir, 'apple', 'Sources', 'ExpoModulesJSI-Cxx', 'include', 'RuntimeScheduler.h');
if (fs.existsSync(runtimeSchedulerFile)) {
  const rsContent = `#pragma once

#ifdef __cplusplus

#include <atomic>
#include <swift/bridging>

namespace expo {
class RuntimeScheduler;
}

inline void retainRuntimeScheduler(expo::RuntimeScheduler *scheduler);
inline void releaseRuntimeScheduler(expo::RuntimeScheduler *scheduler);

namespace expo {

class __attribute__((swift_attr("import_reference")))
      __attribute__((swift_attr("retain:retainRuntimeScheduler")))
      __attribute__((swift_attr("release:releaseRuntimeScheduler")))
RuntimeScheduler {
public:
  enum class Priority : int {
    ImmediatePriority = 1,
    UserBlockingPriority = 2,
    NormalPriority = 3,
    LowPriority = 4,
    IdlePriority = 5,
  };

  using ScheduleTaskCallback = void(^)();
  using ScheduleFn = void (*)(void *nativeScheduler, int priority, ScheduleTaskCallback callback);

private:
  void *const nativeScheduler{nullptr};
  const ScheduleFn scheduleFn{nullptr};
  std::atomic<int> refCount{1};

public:
  RuntimeScheduler(void *scheduler, ScheduleFn fn) noexcept
      : nativeScheduler(scheduler), scheduleFn(fn) {}

  RuntimeScheduler() {}

  RuntimeScheduler(const RuntimeScheduler &) = delete;

  static RuntimeScheduler *create() {
    return new RuntimeScheduler();
  }

  static RuntimeScheduler *create(void *scheduler, ScheduleFn fn) {
    return new RuntimeScheduler(scheduler, fn);
  }

  bool supportsAsyncScheduling() const noexcept {
    return scheduleFn != nullptr;
  }

  void scheduleTask(Priority priority, ScheduleTaskCallback callback) noexcept {
    if (scheduleFn != nullptr) {
      scheduleFn(nativeScheduler, static_cast<int>(priority), callback);
    } else {
      callback();
    }
  }

  void retain() {
    refCount.fetch_add(1, std::memory_order_relaxed);
  }

  void release() {
    if (refCount.fetch_sub(1, std::memory_order_acq_rel) == 1) {
      delete this;
    }
  }
};

} // namespace expo

inline void retainRuntimeScheduler(expo::RuntimeScheduler *scheduler) {
  if (scheduler) {
    scheduler->retain();
  }
}

inline void releaseRuntimeScheduler(expo::RuntimeScheduler *scheduler) {
  if (scheduler) {
    scheduler->release();
  }
}

#endif // __cplusplus
`;
  fs.writeFileSync(runtimeSchedulerFile, rsContent, 'utf8');
  console.log('[patch] Replaced RuntimeScheduler.h with static factory create methods');
}

// 4. Patch HostFunctionClosure.h with static create factory and global retain/release
const hostClosureFile = path.join(baseDir, 'apple', 'Sources', 'ExpoModulesJSI-Cxx', 'include', 'HostFunctionClosure.h');
if (fs.existsSync(hostClosureFile)) {
  const hcContent = `#pragma once

#include <swift/bridging>
#include <jsi/jsi.h>
#include "RetainedSwiftPointer.h"

namespace expo {
class HostFunctionClosure;
}

inline void retainHostFunctionClosure(expo::HostFunctionClosure *closure);
inline void releaseHostFunctionClosure(expo::HostFunctionClosure *closure);

namespace expo {

class __attribute__((swift_attr("import_reference")))
      __attribute__((swift_attr("retain:retainHostFunctionClosure")))
      __attribute__((swift_attr("release:releaseHostFunctionClosure")))
HostFunctionClosure final : public RetainedSwiftPointer {
public:
  using Closure = bool(Context context, const facebook::jsi::Value *_Nonnull thisValue, const facebook::jsi::Value *_Nonnull args, size_t count, facebook::jsi::Value *_Nonnull result);

  explicit HostFunctionClosure(Context context, Closure closure, Deallocator deallocator) : RetainedSwiftPointer(context, deallocator), _closure(closure) {};

  static HostFunctionClosure *create(Context context, Closure closure, Deallocator deallocator) {
    return new HostFunctionClosure(context, closure, deallocator);
  }

  virtual ~HostFunctionClosure() {
    _deallocator(_context);
  }

  inline bool call(const facebook::jsi::Value &thisValue, const facebook::jsi::Value *_Nonnull args, size_t count, facebook::jsi::Value &result) const {
    return _closure(_context, &thisValue, args, count, &result);
  }

private:
  Closure *_Nonnull _closure;

};

} // namespace expo

inline void retainHostFunctionClosure(expo::HostFunctionClosure *closure) {}

inline void releaseHostFunctionClosure(expo::HostFunctionClosure *closure) {
  delete closure;
}
`;
  fs.writeFileSync(hostClosureFile, hcContent, 'utf8');
  console.log('[patch] Replaced HostFunctionClosure.h with static factory create method');
}

// 5. Patch JavaScriptRuntime.swift to use factory methods, appendPropNameForUtf8, and solve Swift 6 concurrency errors
const jsRuntimeFile = path.join(baseDir, 'apple', 'Sources', 'ExpoModulesJSI', 'Runtime', 'JavaScriptRuntime.swift');
if (fs.existsSync(jsRuntimeFile)) {
  let jsContent = fs.readFileSync(jsRuntimeFile, 'utf8');
  // Use static factory create methods
  jsContent = jsContent.replace(/expo\.RuntimeScheduler\(\)/g, 'expo.RuntimeScheduler.create()');
  jsContent = jsContent.replace(/expo\.RuntimeScheduler\(scheduler,\s*fn\)/g, 'expo.RuntimeScheduler.create(scheduler, fn)');
  jsContent = jsContent.replace(/expo\.HostFunctionClosure\(context,\s*call,\s*deallocate\)/g, 'expo.HostFunctionClosure.create(context, call, deallocate)');
  // Replace property name loop with appendPropNameForUtf8
  const loopRegex = /for propertyName in propertyNames \{[\s\S]*?vector\.push_back[\s\S]*?\}/;
  if (loopRegex.test(jsContent)) {
    jsContent = jsContent.replace(loopRegex, `for propertyName in propertyNames {
        propertyName.withCString { cStr in
          expo.appendPropNameForUtf8(&vector, iRuntime, cStr)
        }
      }`);
  }

  // Swift 6 strict concurrency fixes: passing pointers across actor isolation boundaries
  const getterTarget = `      let propertyName = String(cString: propertyName)
      nonisolated(unsafe) let resultPtr = resultPtr

      return withGuaranteedContext(context) { (context: HostObjectContext, runtime) in
        return JavaScriptActor.assumeIsolated {
          return forwardingSwiftErrorsToJS(runtime: runtime) {
            try context.get(propertyName).writeJSIValue(to: resultPtr)
          }
        }
      }`;

  const getterReplacement = `      let propertyName = String(cString: propertyName)
      let resultPtrBits = UInt(bitPattern: resultPtr)

      return withGuaranteedContext(context) { (context: HostObjectContext, runtime) in
        return JavaScriptActor.assumeIsolated {
          let resultPtr = UnsafeMutablePointer<facebook.jsi.Value>(bitPattern: resultPtrBits)!
          return forwardingSwiftErrorsToJS(runtime: runtime) {
            try context.get(propertyName).writeJSIValue(to: resultPtr)
          }
        }
      }`;
  jsContent = jsContent.replace(getterTarget, getterReplacement);

  const fn1Target = `    nonisolated(unsafe) let thisPtr = thisPtr
    nonisolated(unsafe) let argumentsPtr = argumentsPtr
    nonisolated(unsafe) let resultPtr = resultPtr

    // See \`withGuaranteedContext\` for why neither the context nor the runtime is retained here, and
    // why the result is written to the caller's slot instead of being returned.
    return withGuaranteedContext(context) { (context: HostFunctionContext, runtime) in
      return JavaScriptActor.assumeIsolated {
        return forwardingSwiftErrorsToJS(runtime: runtime) {
          let this = UnsafeMutablePointer(mutating: thisPtr).move()
          let arguments = JavaScriptValuesBuffer(runtime, start: argumentsPtr, count: argumentsCount)
          let thisValue = JavaScriptValue(runtime, this)
          try context.call(thisValue, consume arguments).writeJSIValue(to: resultPtr)
        }
      }
    }`;

  const fn1Replacement = `    let thisPtrBits = UInt(bitPattern: thisPtr)
    let argumentsPtrBits = UInt(bitPattern: argumentsPtr)
    let resultPtrBits = UInt(bitPattern: resultPtr)

    // See \`withGuaranteedContext\` for why neither the context nor the runtime is retained here, and
    // why the result is written to the caller's slot instead of being returned.
    return withGuaranteedContext(context) { (context: HostFunctionContext, runtime) in
      return JavaScriptActor.assumeIsolated {
        let thisPtr = UnsafePointer<facebook.jsi.Value>(bitPattern: thisPtrBits)!
        let argumentsPtr = UnsafePointer<facebook.jsi.Value>(bitPattern: argumentsPtrBits)
        let resultPtr = UnsafeMutablePointer<facebook.jsi.Value>(bitPattern: resultPtrBits)!
        return forwardingSwiftErrorsToJS(runtime: runtime) {
          let this = UnsafeMutablePointer(mutating: thisPtr).move()
          let arguments = JavaScriptValuesBuffer(runtime, start: argumentsPtr, count: argumentsCount)
          let thisValue = JavaScriptValue(runtime, this)
          try context.call(thisValue, consume arguments).writeJSIValue(to: resultPtr)
        }
      }
    }`;
  jsContent = jsContent.replace(fn1Target, fn1Replacement);

  const fn2Target = `    nonisolated(unsafe) let thisPtr = thisPtr
    nonisolated(unsafe) let argumentsPtr = argumentsPtr
    nonisolated(unsafe) let resultPtr = resultPtr

    // See \`withGuaranteedContext\` for why neither the context nor the runtime is retained here, and
    // why the result is written to the caller's slot instead of being returned.
    return withGuaranteedContext(context) { (context: UnownedThisHostFunctionContext, runtime) in
      return JavaScriptActor.assumeIsolated {
        return forwardingSwiftErrorsToJS(runtime: runtime) {
          let arguments = JavaScriptValuesBuffer(runtime, start: argumentsPtr, count: argumentsCount)
          let thisValue = JavaScriptUnownedValue(runtime.pointee, thisPtr)
          try context.call(thisValue, consume arguments).writeJSIValue(to: resultPtr)
        }
      }
    }`;

  const fn2Replacement = `    let thisPtrBits = UInt(bitPattern: thisPtr)
    let argumentsPtrBits = UInt(bitPattern: argumentsPtr)
    let resultPtrBits = UInt(bitPattern: resultPtr)

    // See \`withGuaranteedContext\` for why neither the context nor the runtime is retained here, and
    // why the result is written to the caller's slot instead of being returned.
    return withGuaranteedContext(context) { (context: UnownedThisHostFunctionContext, runtime) in
      return JavaScriptActor.assumeIsolated {
        let thisPtr = UnsafePointer<facebook.jsi.Value>(bitPattern: thisPtrBits)!
        let argumentsPtr = UnsafePointer<facebook.jsi.Value>(bitPattern: argumentsPtrBits)
        let resultPtr = UnsafeMutablePointer<facebook.jsi.Value>(bitPattern: resultPtrBits)!
        return forwardingSwiftErrorsToJS(runtime: runtime) {
          let arguments = JavaScriptValuesBuffer(runtime, start: argumentsPtr, count: argumentsCount)
          let thisValue = JavaScriptUnownedValue(runtime.pointee, thisPtr)
          try context.call(thisValue, consume arguments).writeJSIValue(to: resultPtr)
        }
      }
    }`;
  jsContent = jsContent.replace(fn2Target, fn2Replacement);

  fs.writeFileSync(jsRuntimeFile, jsContent, 'utf8');
  console.log('[patch] Patched JavaScriptRuntime.swift with factory create calls, appendPropNameForUtf8, and Swift 6 concurrency safe bitPattern casts');
}

// 6. Disable Expo precompiled modules so everything builds from source (avoids Swift 6.3 vs 6.1 swiftinterface mismatch)
const precompiledFile = path.join(__dirname, '..', 'node_modules', 'expo-modules-autolinking', 'scripts', 'ios', 'precompiled_modules.rb');
if (fs.existsSync(precompiledFile)) {
  let pcContent = fs.readFileSync(precompiledFile, 'utf8');
  if (!pcContent.includes('def enabled?\n        return false')) {
    pcContent = pcContent.replace('def enabled?', 'def enabled?\n        return false');
  }
  if (!pcContent.includes('def try_link_with_prebuilt_xcframework(spec)\n        return false')) {
    pcContent = pcContent.replace('def try_link_with_prebuilt_xcframework(spec)', 'def try_link_with_prebuilt_xcframework(spec)\n        return false');
  }
  fs.writeFileSync(precompiledFile, pcContent, 'utf8');
  console.log('[patch] Disabled precompiled modules in precompiled_modules.rb (forcing source build)');
}

// 7. Walk all Expo package directories for general fixes (Sendable, weak let, trailing commas, swift-tools-version)
const nodeModulesDir = path.join(__dirname, '..', 'node_modules');
const targetDirs = [];
if (fs.existsSync(nodeModulesDir)) {
  fs.readdirSync(nodeModulesDir).forEach(name => {
    if (name.startsWith('expo') || name.startsWith('@expo')) {
      const p = path.join(nodeModulesDir, name);
      if (fs.statSync(p).isDirectory()) {
        if (name === '@expo') {
          fs.readdirSync(p).forEach(sub => targetDirs.push(path.join(p, sub)));
        } else {
          targetDirs.push(p);
        }
      }
    }
  });
}

targetDirs.forEach(dir => {
  if (fs.existsSync(dir)) {
    const files = walk(dir);
    files.forEach(f => {
      if (f.endsWith('.swift') || f.endsWith('.h') || f.endsWith('.cpp')) {
        let content = fs.readFileSync(f, 'utf8');
        let changed = false;

        // Fix Swift tools version 6.2 -> 6.0
        if (content.includes('swift-tools-version: 6.2')) {
          content = content.replace(/swift-tools-version:\s*6\.2/g, 'swift-tools-version: 6.0');
          changed = true;
        }

        // Fix weak let and Sendable mutable properties with nonisolated(unsafe) weak var
        if (content.includes('weak let runtime') || content.includes('weak var runtime')) {
          content = content.replace(/(nonisolated\(unsafe\)\s+)?(private|internal)?\s*weak\s+(let|var)\s+runtime/g, (match, prefix, visibility) => {
            const vis = visibility ? visibility + ' ' : '';
            return `nonisolated(unsafe) ${vis}weak var runtime`;
          });
          changed = true;
        }

        // Any other weak let (change to weak var without duplicating modifiers)
        if (content.includes('weak let')) {
          content = content.replace(/\bweak\s+let\b/g, 'weak var');
          changed = true;
        }

        // Fix trailing commas before closing parentheses in Swift files
        if (f.endsWith('.swift') && content.match(/,\s*\)/)) {
          content = content.replace(/,\s*\)/g, ')');
          changed = true;
        }

        if (changed) {
          fs.writeFileSync(f, content, 'utf8');
          console.log('[patch] Fixed compatibility in:', path.basename(f));
        }
      }
    });
  }
});

// 8. Surgical fixes for expo-modules-core source build under Xcode 16 / Swift 6
const coreDir = path.join(__dirname, '..', 'node_modules', 'expo-modules-core');
if (fs.existsSync(coreDir)) {
  // 8a. ViewDefinition.swift
  const viewDefFile = path.join(coreDir, 'ios', 'Core', 'Views', 'ViewDefinition.swift');
  if (fs.existsSync(viewDefFile)) {
    let c = fs.readFileSync(viewDefFile, 'utf8');
    c = c.replace(/extension\s+UIView:\s*@MainActor\s+AnyArgument/g, '@MainActor extension UIView: AnyArgument');
    fs.writeFileSync(viewDefFile, c, 'utf8');
  }

  // 8b. SwiftUIHostingView.swift
  const hostingFile = path.join(coreDir, 'ios', 'Core', 'Views', 'SwiftUI', 'SwiftUIHostingView.swift');
  if (fs.existsSync(hostingFile)) {
    let c = fs.readFileSync(hostingFile, 'utf8');
    c = c.replace(/internal\s+protocol\s+AnyExpoSwiftUIHostingView/g, '@MainActor internal protocol AnyExpoSwiftUIHostingView');
    c = c.replace(/:\s*ExpoView,\s*@MainActor\s+AnyExpoSwiftUIHostingView/g, ': ExpoView, AnyExpoSwiftUIHostingView');
    fs.writeFileSync(hostingFile, c, 'utf8');
  }

  // 8c. SwiftUIVirtualView.swift
  const virtFile = path.join(coreDir, 'ios', 'Core', 'Views', 'SwiftUI', 'SwiftUIVirtualView.swift');
  if (fs.existsSync(virtFile)) {
    let c = fs.readFileSync(virtFile, 'utf8');
    c = c.replace(/:\s*SwiftUIVirtualViewObjC,\s*@MainActor\s+ExpoSwiftUIView/g, ': SwiftUIVirtualViewObjC, ExpoSwiftUIView');
    c = c.replace(/:\s*SwiftUIVirtualViewObjCDev,\s*@MainActor\s+ExpoSwiftUIView/g, ': SwiftUIVirtualViewObjCDev, ExpoSwiftUIView');
    c = c.replace(/extension\s+ExpoSwiftUI\.SwiftUIVirtualView:\s*@MainActor\s+ExpoSwiftUI\.ViewWrapper/g, '@MainActor extension ExpoSwiftUI.SwiftUIVirtualView: ExpoSwiftUI.ViewWrapper');
    c = c.replace(/extension\s+ExpoSwiftUI\.SwiftUIVirtualViewDev:\s*@MainActor\s+ExpoSwiftUI\.ViewWrapper/g, '@MainActor extension ExpoSwiftUI.SwiftUIVirtualViewDev: ExpoSwiftUI.ViewWrapper');
    fs.writeFileSync(virtFile, c, 'utf8');
  }

  // 8d. ExpoSwiftUI.swift
  const expoSwiftUIFile = path.join(coreDir, 'ios', 'Core', 'Views', 'SwiftUI', 'ExpoSwiftUI.swift');
  if (fs.existsSync(expoSwiftUIFile)) {
    let c = fs.readFileSync(expoSwiftUIFile, 'utf8');
    c = c.replace(/public\s+protocol\s+ViewWrapper/g, '@MainActor public protocol ViewWrapper');
    fs.writeFileSync(expoSwiftUIFile, c, 'utf8');
  }

  // 8e. SceneGeometry.swift
  const sceneGeoFile = path.join(coreDir, 'ios', 'Utilities', 'SceneGeometry.swift');
  if (fs.existsSync(sceneGeoFile)) {
    let c = fs.readFileSync(sceneGeoFile, 'utf8');
    c = c.replace(/public\s+enum\s+SceneGeometry/g, '@MainActor public enum SceneGeometry');
    fs.writeFileSync(sceneGeoFile, c, 'utf8');
  }

  // 8f. DynamicSwiftUIViewType.swift
  const dynViewFile = path.join(coreDir, 'ios', 'Core', 'DynamicTypes', 'DynamicSwiftUIViewType.swift');
  if (fs.existsSync(dynViewFile)) {
    let c = fs.readFileSync(dynViewFile, 'utf8');
    c = c.replace(/performSynchronouslyOnMainThread/g, 'performSynchronouslyOnMainActor');
    fs.writeFileSync(dynViewFile, c, 'utf8');
  }

  // 8g. ExpoReactDelegate.swift
  const reactDelFile = path.join(coreDir, 'ios', 'ReactDelegates', 'ExpoReactDelegate.swift');
  if (fs.existsSync(reactDelFile)) {
    let c = fs.readFileSync(reactDelFile, 'utf8');
    c = c.replace(/public\s+func\s+createRootViewController\(\)/g, '@MainActor public func createRootViewController()');
    fs.writeFileSync(reactDelFile, c, 'utf8');
  }

  // 8h. URLAuthenticationChallengeForwardSender.swift
  const authFile = path.join(coreDir, 'ios', 'DevTools', 'URLAuthenticationChallengeForwardSender.swift');
  if (fs.existsSync(authFile)) {
    let c = fs.readFileSync(authFile, 'utf8');
    c = c.replace(/let\s+completionHandler:\s*\(/g, 'nonisolated(unsafe) let completionHandler: (');
    fs.writeFileSync(authFile, c, 'utf8');
  }

  // 8i. URLSessionSessionDelegateProxy.swift
  const proxyFile = path.join(coreDir, 'ios', 'DevTools', 'URLSessionSessionDelegateProxy.swift');
  if (fs.existsSync(proxyFile)) {
    let c = fs.readFileSync(proxyFile, 'utf8');
    c = c.replace(/private\s+var\s+delegateMap:/g, 'private nonisolated(unsafe) var delegateMap:');
    fs.writeFileSync(proxyFile, c, 'utf8');
  }

  // 8j. SwiftUIViewFrameObserver.swift
  const frameObsFile = path.join(coreDir, 'ios', 'Core', 'Views', 'SwiftUI', 'SwiftUIViewFrameObserver.swift');
  if (fs.existsSync(frameObsFile)) {
    let c = fs.readFileSync(frameObsFile, 'utf8');
    c = c.replace(/observer\s*=\s*view\.observe\(\\\.bounds,\s*options:\s*\[\.old,\s*\.new\]\)\s*\{\s*view,\s*change\s*in[\s\S]*?callback\(CGRect\(origin:\s*view\.frame\.origin,\s*size:\s*newValue\.size\)\)\s*\}/, `nonisolated(unsafe) let safeView = view
      observer = view.observe(\\.bounds, options: [.old, .new]) { _, change in
        guard let newValue = change.newValue else { return }
        callback(CGRect(origin: safeView.frame.origin, size: newValue.size))
      }`);
    fs.writeFileSync(frameObsFile, c, 'utf8');
  }

  // 8k. Set swift_version to 5.9 in ExpoModulesCore.podspec as fallback safety
  const corePodspec = path.join(coreDir, 'ExpoModulesCore.podspec');
  if (fs.existsSync(corePodspec)) {
    let c = fs.readFileSync(corePodspec, 'utf8');
    c = c.replace(/s\.swift_version\s*=\s*['"]6\.0['"]/g, "s.swift_version = '5.9'");
    fs.writeFileSync(corePodspec, c, 'utf8');
  }

  console.log('[patch] Applied surgical Swift 6 compatibility fixes to expo-modules-core');
}


