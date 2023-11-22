import express from "express";

import {
  isAuthenticated,
  authentication,
  register,
  gets,
  get,
  create,
  update,
  sendResetPassword,
  getResetPassword,
  resetPassword,
} from "../controllers/users.js";

const router = express.Router();

router.get("/isAuth/:responsable", isAuthenticated);

router.post("/login", authentication);

router.post("/register", register);

router.get("/:responsable", gets);

router.get("/:id/:responsable", get);

router.post("/", create);

router.put("/", update);

router.post("/sendResetPassword", sendResetPassword);

router.post("/getResetPassword", getResetPassword);

router.post("/resetPassword", resetPassword);

export default router;
