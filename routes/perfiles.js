import express from "express";

import { gets } from "../controllers/perfiles.js";

const router = express.Router();

router.get("/gets", gets);

export default router;
