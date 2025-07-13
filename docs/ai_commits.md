## 📄 File: `src/physics.js`
### 🧠 Task: Fix misplaced JSDoc on `setupPhysics(...)`

---

### ⚠️ Issue Raised by CodeRabbit:

> **"Doc-block is bound to the constant, not the setupPhysics API."**  
> Placing the JSDoc block after `WATER_SPLASH_THRESHOLD` made it apply to that constant instead of the `setupPhysics()` function. This caused:
> - 📉 JSDoc generators & IDE IntelliSense to ignore the actual function
> - 🧹 Linter warnings about missing `@returns` type
> - 🤖 CodeRabbit not being able to reason about the function properly

---

### 🔁 CodeRabbit Suggested:

```diff
-const WATER_SPLASH_THRESHOLD = 5; /**
- * Initializes and manages the physics simulation for an aircraft...
+/**
+ * Initializes and manages the physics simulation for an aircraft...
+ * @param {THREE.Object3D} aircraft
+ * @param {Function} onTakeoff
+ * ...
+ * @returns {void}
+ */
+const WATER_SPLASH_THRESHOLD = 5;