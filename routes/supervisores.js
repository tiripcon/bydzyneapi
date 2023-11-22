import express from "express";

import { gets } from "../controllers/supervisores.js";

const router = express.Router();

router.get("/:responsable", gets);

export default router;
