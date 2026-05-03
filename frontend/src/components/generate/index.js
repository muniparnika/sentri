/** @module components/generate — Test generation flow components. */
export { default as GenerateView } from "./GenerateView.jsx";
// GenerateTestModal and its ExploreModePicker dependency removed — the AI
// generation flow now lives on the dedicated Test Lab page
// (frontend/src/pages/TestLab.jsx). The files `./GenerateTestModal.jsx` and
// `./ExploreModePicker.jsx` have no remaining importers and should be deleted.
export { default as GenerationSuccessBanner } from "./GenerationSuccessBanner.jsx";
