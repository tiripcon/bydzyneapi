import jwt from "jsonwebtoken";
import pg from "pg";

import { getPgSettings, getSecretKEY } from "../utilities/index.js";

const { Pool } = pg;
const pool = new Pool(getPgSettings());
const secret = getSecretKEY();

export const gets = async (req, res) => {
  try {
    const { responsable } = req.params;
    const token = req.headers.authorization.split(" ")[1];
    const payload = jwt.verify(token, secret);
    if (responsable !== payload.login) {
      return res.status(401).send({
        estado: false,
        detalle: "Inicie sesión nuevamente. Token expirado.",
        retorno: 0,
      });
    }
    const response = await pool.query(
      `SELECT
      id, "idPerfil", identificacion, nombres, "apellidoPaterno", "apellidoMaterno", "idPais", "idCiudad", telefono, correo, password, "idResponsable"
      , activo, eliminado, fechaCreacion, responsableCreacion, fechaActualizacion, responsableActualizacion
      FROM bd_seguridad.seg_t_usuario
      WHERE EXISTS (
        SELECT id FROM bd_seguridad.seg_t_usuario WHERE correo = '${responsable}' AND "idPerfil" IN (1)
      ) AND "idPerfil = 2;`
    );
    const { rows } = response;
    res.send(rows);
  } catch (e) {
    res.status(400).send({
      estado: false,
      detalle: "Lo sentimos, ocurrio un error.",
      retorno: e.message,
    });
  }
};
