# RCA: Step Buttons Not Working (Issue #201)

## Summary

Step buttons were reported as not working on Linux v0.4.1. Investigation revealed this was not a Linux-specific issue but a cross-platform bug where the step buttons were not wired to any tuning mechanism.

## Root Cause

The step buttons in `TuningStepWidget.tsx` updated the `stepHz` value in the Zustand toolbar favorites store, but no tuning mechanism consumed this value. The keyboard arrow left/right shortcuts used a hardcoded 500 Hz step constant instead of reading from the store.

## Impact

- Step buttons appeared functional (visual feedback worked correctly)
- Clicking different step values had no effect on actual tuning behavior
- Arrow key tuning always used 500 Hz regardless of selected step
- Issue affected all platforms, not just Linux

## Fix

Modified `use-keyboard-shortcuts.ts` to:
1. Import `useToolbarFavoritesStore`
2. Read `stepHz` from the store in the `bumpTune()` function
3. Pass `stepHz` parameter to the `snapHz()` helper function
4. Update the snap calculation to use the dynamic step value

## Verification

- Frontend build: ✓ (TypeScript compilation successful)
- Backend build: ✓ (dotnet build successful)
- Step buttons now control keyboard arrow key tuning step

## Lessons

**When adding UI controls, verify the data flow end-to-end:**
1. UI control → state store (TuningStepWidget → toolbar-favorites-store)
2. State store → consumer (toolbar-favorites-store → use-keyboard-shortcuts)

Missing step 2 was the root cause. The store update worked perfectly, but no consumer read the value.

**For future similar features:**
- Search for all usages of a state value when adding new state
- Use TypeScript "find all references" to identify consumers
- Test the complete workflow, not just UI feedback
- Document the data flow in code comments where non-obvious

## Related Files

- `zeus-web/src/components/TuningStepWidget.tsx` (UI control)
- `zeus-web/src/state/toolbar-favorites-store.ts` (state store)
- `zeus-web/src/util/use-keyboard-shortcuts.ts` (consumer, fixed)
- `zeus-web/src/components/VfoDisplay.tsx` (wheel tuning, separate mechanism)
