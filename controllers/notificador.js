import nodemailer from "nodemailer";
import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  host: "127.0.0.1",
  user: "postgres",
  password: "postgres",
  database: "db_bydzyne",
  port: 5432,
});

const getSettings = async () => {
  try {
    const query = `select "nombreMostrar", usuario, password, servidor, puerto, ssl from bd_seguridad.seg_t_smtp where activo = true;`;
    const response = await pool.query(query);
    const { rows } = response;
    if (rows.length > 0) {
      return {
        config: {
          host: rows[0].servidor,
          port: rows[0].puerto,
          auth: {
            user: rows[0].usuario,
            pass: rows[0].password,
          },
        },
        from: {
          name: rows[0].nombreMostrar,
          address: rows[0].usuario,
        },
      };
    } else {
      return {};
    }
  } catch (e) {
    return {};
  }
};

export const enviar = (mensaje) => {
  getSettings().then((response) => {
    let transporter = nodemailer.createTransport(response.config);
    const message = { ...mensaje, from: response.from };
    transporter.sendMail(message, (error, info) => {
      if (error) {
        return {
          estado: true,
          detalle: "No fue posible enviar la notificación.",
          retorno: error,
        };
      } else {
        return {
          estado: true,
          detalle: "Notificación enviada correctamente.",
          retorno: info,
        };
      }
    });
  });
};
