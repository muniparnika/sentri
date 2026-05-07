// Moved to backend/src/constants/activityTypes.js so the backend Docker
// image (which only copies `backend/`) can include it. This file is a
// thin re-export and can be deleted once no callers remain.
export { ACTIVITY_TYPES } from "../backend/src/constants/activityTypes.js";
