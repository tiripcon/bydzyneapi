import express from "express";

import { gets } from "../controllers/paises.js";

const router = express.Router();

router.get("/:responsable", gets);

export default router;
