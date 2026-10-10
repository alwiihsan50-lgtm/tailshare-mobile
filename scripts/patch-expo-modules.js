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

// 1. Patch Task+immediate.swift (remove speculative iOS 26 Task.immediate API)
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
    return Task(name: name, priority: priority ?? .high, operation: operation)
  }
}
`;
  fs.writeFileSync(taskImmediateFile, content, 'utf8');
  console.log('[patch] Replaced Task+immediate.swift');
}

// 2. Patch RuntimeScheduler.h with instance retain/release methods (.retain, .release)
// This resolves the lookup error in Swift Clang importer (which looks for .retain on the class instead of failing to find free functions in namespace expo)
const runtimeSchedulerFile = path.join(baseDir, 'apple', 'Sources', 'ExpoModulesJSI-Cxx', 'include', 'RuntimeScheduler.h');
if (fs.existsSync(runtimeSchedulerFile)) {
  const rsContent = `#pragma once

#ifdef __cplusplus

#include <atomic>
#include <swift/bridging>

namespace expo {

class RuntimeScheduler {
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
  SWIFT_RETURNS_RETAINED RuntimeScheduler(void *scheduler, ScheduleFn fn) noexcept
      : nativeScheduler(scheduler), scheduleFn(fn) {}

  SWIFT_RETURNS_RETAINED RuntimeScheduler() {}

  RuntimeScheduler(const RuntimeScheduler &) = delete;

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

  void retain() const noexcept {
    const_cast<RuntimeScheduler*>(this)->refCount.fetch_add(1, std::memory_order_relaxed);
  }

  void release() const noexcept {
    if (const_cast<RuntimeScheduler*>(this)->refCount.fetch_sub(1, std::memory_order_acq_rel) == 1) {
      delete const_cast<RuntimeScheduler*>(this);
    }
  }
} __attribute__((swift_attr("import_reference")))
  __attribute__((swift_attr("retain:.retain")))
  __attribute__((swift_attr("release:.release")));

} // namespace expo

#endif // __cplusplus
`;
  fs.writeFileSync(runtimeSchedulerFile, rsContent, 'utf8');
  console.log('[patch] Replaced RuntimeScheduler.h with member retain/release');
}

// 3. Patch HostFunctionClosure.h with member retain/release (.retain, .release)
const hostClosureFile = path.join(baseDir, 'apple', 'Sources', 'ExpoModulesJSI-Cxx', 'include', 'HostFunctionClosure.h');
if (fs.existsSync(hostClosureFile)) {
  const hcContent = `#pragma once

#include <swift/bridging>
#include <jsi/jsi.h>
#include "RetainedSwiftPointer.h"

namespace expo {

class HostFunctionClosure final : public RetainedSwiftPointer {
public:
  using Closure = bool(Context context, const facebook::jsi::Value *_Nonnull thisValue, const facebook::jsi::Value *_Nonnull args, size_t count, facebook::jsi::Value *_Nonnull result);

  SWIFT_RETURNS_RETAINED explicit HostFunctionClosure(Context context, Closure closure, Deallocator deallocator) : RetainedSwiftPointer(context, deallocator), _closure(closure) {};

  virtual ~HostFunctionClosure() {
    _deallocator(_context);
  }

  inline bool call(const facebook::jsi::Value &thisValue, const facebook::jsi::Value *_Nonnull args, size_t count, facebook::jsi::Value &result) const {
    return _closure(_context, &thisValue, args, count, &result);
  }

  void retain() const noexcept {}
  void release() const noexcept {
    delete const_cast<HostFunctionClosure*>(this);
  }

private:
  Closure *_Nonnull _closure;

} __attribute__((swift_attr("import_reference")))
  __attribute__((swift_attr("retain:.retain")))
  __attribute__((swift_attr("release:.release")));

} // namespace expo
`;
  fs.writeFileSync(hostClosureFile, hcContent, 'utf8');
  console.log('[patch] Replaced HostFunctionClosure.h with member retain/release');
}

// 4. Walk all remaining files for general fixes (Sendable, trailing commas, swift-tools-version)
const targetDirs = [
  path.join(__dirname, '..', 'node_modules', 'expo-modules-jsi'),
  path.join(__dirname, '..', 'node_modules', '@expo', 'expo-modules-macros-plugin')
];

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

        // Any other weak let
        if (content.includes('weak let')) {
          content = content.replace(/\bweak\s+let\b/g, 'nonisolated(unsafe) weak var');
          changed = true;
        }

        // Fix trailing commas before closing parentheses
        if (content.match(/,\s*\)/)) {
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
