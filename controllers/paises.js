import pg from "pg";

import { getPgSettings } from "../utilities/index.js";

const { Pool } = pg;
const pool = new Pool(getPgSettings());

export const gets = async (req, res) => {
  try {
    const { responsable } = req.params;
    if (responsable !== "anonymous") {
      const token = req.headers.authorization.split(" ")[1];
      const payload = jwt.verify(token, secret);
      if (responsable !== payload.login) {
        return res.status(401).send({
          estado: false,
          detalle: "Inicie sesión nuevamente. Token expirado.",
          retorno: 0,
        });
      }
    }
    const response = await pool.query(
      `select id, nombre from bd_seguridad.seg_t_dpa where "idParent" is null and nivel = 1 order by nombre;`
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
