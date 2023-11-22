import jwt from "jsonwebtoken";
import pg from "pg";
import { v4 as uuidv4 } from "uuid";

import {
  getBaseURL,
  getPgSettings,
  getSecretKEY,
  getWebSite,
} from "../utilities/index.js";

const { Pool } = pg;
const pool = new Pool(getPgSettings());
const secret = getSecretKEY();
const baseURL = getBaseURL();
const webSite = getWebSite();

import { enviar } from "./notificador.js";

export const isAuthenticated = async (req, res) => {
  try {
    const token =
      req.headers.authorization && req.headers.authorization.split(" ")[1];
    if (token !== undefined && token !== null && token !== "") {
      const { login } = jwt.verify(token, secret);
      const { responsable } = req.params;
      if (responsable !== login) {
        return res.status(401).send({
          estado: false,
          detalle: "Inicie sesión nuevamente.",
          retorno: "Token Incorrecto",
        });
      } else {
        return res.send({
          estado: true,
          detalle: "Autenticado correctamente.",
          retorno: "",
        });
      }
    } else {
      return res.status(401).send({
        estado: false,
        detalle: "Inicie sesión nuevamente.",
        retorno: "Token no existe",
      });
    }
  } catch (e) {
    res.status(400).send({
      estado: false,
      detalle: "Inicie sesión nuevamente.",
      retorno: e.message,
    });
  }
};

export const authentication = async (req, res) => {
  try {
    const { login, password } = req.body;
    const response = await pool.query(
      `SELECT
    id, "idPerfil", identificacion, nombres, "apellidoPaterno", "apellidoMaterno", "idPais", "idCiudad", telefono, correo, password, "idResponsable"
    , activo, eliminado, fechaCreacion, responsableCreacion, fechaActualizacion, responsableActualizacion
    FROM bd_seguridad.seg_t_usuario
    WHERE activo = '1'::"bit" AND "idPerfil" IS NOT NULL AND correo = '${login}' AND password = MD5('${password}')`
    );
    const { rows } = response;
    if (rows.length <= 0) {
      res.status(400).send({
        estado: false,
        detalle: "Usuario y/o contraseña incorrectos.",
        retorno: "",
      });
    } else {
      const usuario = rows[0].id;
      const perfil = rows[0].idPerfil;
      const token = jwt.sign(
        {
          login,
          usuario,
          perfil,
        },
        secret,
        {
          expiresIn: "24h",
        }
      );
      const retorno = {
        estado: true,
        detalle: "Datos correctos.",
        retorno: token,
      };

      const responseLogin = await pool.query(`
      UPDATE bd_seguridad.seg_t_usuariologin SET fecha = now() WHERE "idUsuario" = '${usuario}';
    `);

      let queryPerfiles = `select id, nombres from bd_seguridad.seg_t_perfil;`;
      if (perfil === "2") {
        queryPerfiles = `select id, nombres from bd_seguridad.seg_t_perfil where id = 3;`;
      } else if (perfil === "3") {
        queryPerfiles = `select id, nombres from bd_seguridad.seg_t_perfil where id = 0;`;
      }
      const responsePerfiles = await pool.query(queryPerfiles);
      const rowsPerfiles = responsePerfiles.rows;

      const responsePaises = await pool.query(
        `select id, nombre from bd_seguridad.seg_t_dpa where "idParent" is null and nivel = 1 order by nombre;`
      );
      const rowsPaises = responsePaises.rows;

      let query = "";
      if (perfil === "1") {
        // Si es usuario Administrador se obtiene todos los supervisores.
        query = `SELECT
        id, nombres || ' ' || "apellidoPaterno" || ' ' || "apellidoMaterno" nombres
        FROM bd_seguridad.seg_t_usuario
        WHERE EXISTS (
          SELECT id FROM bd_seguridad.seg_t_usuario WHERE correo = '${login}' AND "idPerfil" IN (1, 2)
        ) AND "idPerfil" IN (1, 2);`;
      } else if (perfil === "2") {
        // Si es usuario Supervisor se obtiene solo el usuario supervisor que hacer solicitud de autenticación.
        query = `SELECT
        id, nombres || ' ' || "apellidoPaterno" || ' ' || "apellidoMaterno" nombres
        FROM bd_seguridad.seg_t_usuario
        WHERE EXISTS (
          SELECT id FROM bd_seguridad.seg_t_usuario WHERE correo = '${login}' AND "idPerfil" IN (1, 2)
        ) AND "idPerfil" IN (1, 2) AND id = '${usuario}';`;
      }
      const responseSupervisores = await pool.query(query);
      const rowsSupervisores = responseSupervisores.rows;

      const responseOpciones = await pool.query(`
      select b.id, b.codigo, b.nombre, b.titulo, b.icon
      from bd_seguridad.seg_t_perfil_opcion a
      inner join bd_seguridad.seg_t_opcion b on (a."idOpcion" = b.id)
      inner join bd_seguridad.seg_t_perfil c on (a."idPerfil" = c.id)
      inner join bd_seguridad.seg_t_usuario d on (d."idPerfil" = c.id)
      where b.activo = true
      and d.correo = '${login}'
      and d.activo = '1'::"bit";
      `);
      const rowsOpciones = responseOpciones.rows;

      res.send({
        usuario: rows,
        perfiles: rowsPerfiles,
        paises: rowsPaises,
        supervisores: rowsSupervisores,
        options: rowsOpciones,
        retorno,
      });
    }
  } catch (e) {
    res.status(400).send({
      estado: false,
      detalle: "Lo sentimos, ocurrio un error.",
      retorno: e,
    });
  }
};

export const register = async (req, res) => {
  try {
    const user = req.body;
    const userId = uuidv4();
    const userWithId = { ...user, id: userId };
    const response = await pool.query(
      `
      INSERT INTO bd_seguridad.seg_t_usuario
      (id, "idPerfil", identificacion, nombres, "apellidoPaterno", "apellidoMaterno", "idPais", telefono, correo, password, activo, responsablecreacion, responsableactualizacion)
      SELECT '${userWithId.id}' id, 3 "idPerfil",'${userWithId.identificacion}' "identificacion", '${userWithId.nombres}' nombres, '${userWithId.apellidoPaterno}' "apellidoPaterno"
      , '${userWithId.apellidoMaterno}' "apellidoMaterno", ${userWithId.idPais} idPais, '${userWithId.telefono}' telefono
      , '${userWithId.correo}' correo, MD5('${userWithId.password}') AS password, '0'::"bit"
      , '${userWithId.identificacion}' responsablecreacion, '${userWithId.identificacion}' responsableactualizacion;
      `
    );
    const responseLogin = await pool.query(`
    INSERT INTO bd_seguridad.seg_t_usuariologin ("idUsuario") SELECT '${userWithId.id}' AS "idUsuario";
    `);
    const responseUsuario = await pool.query(
      `
      SELECT
      id, "idPerfil", identificacion, nombres, "apellidoPaterno", "apellidoMaterno", "idPais", "idCiudad", telefono, correo, password, "idResponsable"
      , activo, eliminado, fechaCreacion, responsableCreacion, fechaActualizacion, responsableActualizacion
      FROM bd_seguridad.seg_t_usuario
      WHERE id = '${userWithId.id}'; 
      `
    );
    const { rows } = responseUsuario;
    const retorno = {
      estado: true,
      detalle: "Usuario registrado correctamente.",
      retorno: rows[0],
    };
    res.send(retorno);
  } catch (e) {
    res.status(400).send({
      estado: false,
      detalle: "Lo sentimos, ocurrio un error.",
      retorno: e.message,
    });
  }
};

export const gets = async (req, res) => {
  try {
    const { responsable } = req.params;
    const { estado, nombres, correo, presidente } = req.query;
    const token = req.headers.authorization.split(" ")[1];
    const { login, usuario, perfil } = jwt.verify(token, secret);
    if (responsable !== login) {
      return res.status(401).send({
        estado: false,
        detalle: "Inicie sesión nuevamente. Token expirado.",
        retorno: 0,
      });
    }
    let query = "";
    if (perfil === "1") {
      // Si es Administrador se muestran todos los usuarios.
      query = `SELECT
      U.id, U."idPerfil", U.identificacion, U.nombres, U."apellidoPaterno", U."apellidoMaterno", U."idPais", U."idCiudad", U.telefono, U.correo, U.password
      , U."idResponsable", R.nombres || ' ' || R."apellidoPaterno" || ' ' || R."apellidoMaterno" "nombreResponsable"
      , L.fecha AS "fechaUltimoLogin"
      , U.activo, U.eliminado, U.fechaCreacion, U.responsableCreacion, U.fechaActualizacion, U.responsableActualizacion
      FROM bd_seguridad.seg_t_usuario AS U
      LEFT JOIN bd_seguridad.seg_t_usuario AS R ON (U."idResponsable" = R.id)
      LEFT JOIN bd_seguridad.seg_t_usuariologin AS L ON (U.id = L."idUsuario")
      WHERE EXISTS (
        SELECT id FROM bd_seguridad.seg_t_usuario WHERE correo = '${responsable}' AND "idPerfil" IN (1, 2)
        )`;
    } else if (perfil === "2") {
      // Si es Supervisor se consultan solo los usuarios asociados.
      query = `SELECT
      U.id, U."idPerfil", U.identificacion, U.nombres, U."apellidoPaterno", U."apellidoMaterno", U."idPais", U."idCiudad", U.telefono, U.correo, U.password
      , U."idResponsable", R.nombres || ' ' || R."apellidoPaterno" || ' ' || R."apellidoMaterno" "nombreResponsable"
      , L.fecha AS "fechaUltimoLogin"
      , U.activo, U.eliminado, U.fechaCreacion, U.responsableCreacion, U.fechaActualizacion, U.responsableActualizacion
      FROM bd_seguridad.seg_t_usuario AS U
      LEFT JOIN bd_seguridad.seg_t_usuario AS R ON (U."idResponsable" = R.id)
      LEFT JOIN bd_seguridad.seg_t_usuariologin AS L ON (U.id = L."idUsuario")
      WHERE EXISTS (
        SELECT id FROM bd_seguridad.seg_t_usuario WHERE correo = '${responsable}' AND "idPerfil" IN (1, 2)
      )
      AND U."idResponsable" = '${usuario}'`;
    }

    if (
      estado !== undefined &&
      estado !== null &&
      (estado === "1" || estado === "0")
    ) {
      query += ` AND U.activo = '${estado}'`;
    }

    if (nombres !== undefined && nombres !== null && nombres !== "") {
      query += ` AND CONCAT(U.nombres, ' ', U."apellidoPaterno", ' ', U."apellidoMaterno") LIKE '%${nombres}%'`;
    }

    if (correo !== undefined && correo !== null && correo !== "") {
      query += ` AND U.correo LIKE '%${correo}%'`;
    }

    if (
      perfil === "1" &&
      presidente !== undefined &&
      presidente !== null &&
      presidente !== ""
    ) {
      query += ` AND U."idResponsable" = '${presidente}'`;
    }

    query +=
      ' ORDER BY "idPerfil", U.nombres, U."apellidoPaterno", U."apellidoMaterno";';

    const response = await pool.query(query);
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

export const get = async (req, res) => {
  try {
    const token = req.headers.authorization.split(" ")[1];
    const { login, usuario, perfil } = jwt.verify(token, secret);
    const { id, responsable } = req.params;
    if (responsable !== login) {
      return res.status(401).send({
        estado: false,
        detalle: "Inicie sesión nuevamente. Token expirado.",
        retorno: 0,
      });
    }
    let query = "";
    if (perfil === "1") {
      // Si es Administrador se obtiene el usuario.
      query = `SELECT
      id, "idPerfil", identificacion, nombres, "apellidoPaterno", "apellidoMaterno", "idPais", "idCiudad", telefono, correo, password, "idResponsable"
      , activo, eliminado, fechaCreacion, responsableCreacion, fechaActualizacion, responsableActualizacion
      FROM bd_seguridad.seg_t_usuario
      WHERE EXISTS (
        SELECT id FROM bd_seguridad.seg_t_usuario
        WHERE correo = '${responsable}' AND "idPerfil" IN (1, 2)
      )
      AND id = '${id}';`;
    } else if (perfil === "2") {
      // Si es Supervisor se obtiene el usuario solo si este esta asociado al supervisor que realiza la consulta.
      query = `SELECT
      id, "idPerfil", identificacion, nombres, "apellidoPaterno", "apellidoMaterno", "idPais", "idCiudad", telefono, correo, password, "idResponsable"
      , activo, eliminado, fechaCreacion, responsableCreacion, fechaActualizacion, responsableActualizacion
      FROM bd_seguridad.seg_t_usuario
      WHERE EXISTS (
        SELECT id FROM bd_seguridad.seg_t_usuario
        WHERE correo = '${responsable}' AND "idPerfil" IN (1, 2)
      )
      AND id = '${id}' AND "idResponsable" = '${usuario}';`;
    }
    const response = await pool.query(query);
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

export const create = async (req, res) => {
  try {
    const token = req.headers.authorization.split(" ")[1];
    const user = req.body;
    const { responsable } = user;
    const userId = uuidv4();
    const userWithId = { ...user, id: userId };
    const { login, usuario, perfil } = jwt.verify(token, secret);
    if (responsable !== login) {
      return res.status(401).send({
        estado: false,
        detalle: "Inicie sesión nuevamente. Token expirado.",
        retorno: 0,
      });
    }
    const response = await pool.query(
      `
      INSERT INTO bd_seguridad.seg_t_usuario
      (id, "idPerfil", identificacion, nombres, "apellidoPaterno", "apellidoMaterno", "idPais", telefono, correo, password, "idResponsable", responsablecreacion, responsableactualizacion)
      SELECT '${userWithId.id}' id, ${userWithId.idPerfil} "idPerfil",'${userWithId.identificacion}' "identificacion", '${userWithId.nombres}' nombres, '${userWithId.apellidoPaterno}' "apellidoPaterno"
      , '${userWithId.apellidoMaterno}' "apellidoMaterno", ${userWithId.idPais} idPais, '${userWithId.telefono}' telefono
      , '${userWithId.correo}' correo, MD5('${userWithId.password}') AS password
      , '${userWithId.idResponsable}' idResponsable
      , '${userWithId.responsable}' responsablecreacion, '${userWithId.responsable}' responsableactualizacion
      WHERE EXISTS (SELECT id FROM bd_seguridad.seg_t_usuario WHERE correo = '${userWithId.responsable}' AND "idPerfil" IN (1, 2));
      `
    );
    const responseLogin = await pool.query(
      `INSERT INTO bd_seguridad.seg_t_usuariologin ("idUsuario") SELECT '${userWithId.id}' AS "idUsuario";`
    );
    let query = "";
    if (perfil === "1") {
      // Si es Administrador se obtiene el usuario.
      query = `SELECT
      id, "idPerfil", identificacion, nombres, "apellidoPaterno", "apellidoMaterno", "idPais", "idCiudad", telefono, correo, password, "idResponsable"
      , activo, eliminado, fechaCreacion, responsableCreacion, fechaActualizacion, responsableActualizacion
      FROM bd_seguridad.seg_t_usuario
      WHERE EXISTS (
        SELECT id FROM bd_seguridad.seg_t_usuario
        WHERE correo = '${userWithId.responsable}' AND "idPerfil" IN (1, 2)
      )
      AND id = '${userWithId.id}';`;
    } else if (perfil === "2") {
      // Si es Supervisor se obtiene el usuario solo si este esta asociado al supervisor que realiza la consulta.
      query = `SELECT
      id, "idPerfil", identificacion, nombres, "apellidoPaterno", "apellidoMaterno", "idPais", "idCiudad", telefono, correo, password, "idResponsable"
      , activo, eliminado, fechaCreacion, responsableCreacion, fechaActualizacion, responsableActualizacion
      FROM bd_seguridad.seg_t_usuario
      WHERE EXISTS (
        SELECT id FROM bd_seguridad.seg_t_usuario
        WHERE correo = '${userWithId.responsable}' AND "idPerfil" IN (1, 2)
      )
      AND id = '${userWithId.id}' AND "idResponsable" = '${usuario}';`;
    }
    const responseUsuario = await pool.query(query);
    const { rows } = responseUsuario;

    // Notificar de creación de accesos para la plataforma
    if (rows.length > 0) {
      const cuerpoMensaje = `
      <span><strong>BYDZYNE</strong></span><br /><br />
Estimado/a ${rows[0].nombres} ${rows[0].apellidoPaterno} ${rows[0].apellidoMaterno},
<br /><br />
¡Bienvenido/a al camino del emprendimiento!
<br /><br />
Te enviamos tus datos de acceso a nuestra plataforma de aprendizaje.
<br /><br />
<span><strong>Link:</strong></span> <a target='_blank' href='${baseURL}'>${webSite}</a>
<br />
<span><strong>Usuario: </strong></span> ${rows[0].correo}
<br />
<span><strong>Contraseña:</strong></span> ${userWithId.password}
<br /><br />
Si tienes dudas o deseas nuestro acompañamiento no dudes en contactarnos.
<br /><br />
Atentamente,<br />
<span><strong>SISTEMA EQUIPO PRO</strong></span>
      `;
      enviar({
        to: rows[0].correo,
        subject: "¡Bienvenido al camino del emprendimiento!",
        html: cuerpoMensaje,
      });
    }

    const retorno = {
      estado: true,
      detalle: "Usuario registrado correctamente.",
      retorno: rows[0],
    };
    res.send(retorno);
  } catch (e) {
    res.status(400).send({
      estado: false,
      detalle: "Lo sentimos, ocurrio un error.",
      retorno: e.message,
    });
  }
};

export const update = async (req, res) => {
  try {
    const token = req.headers.authorization.split(" ")[1];
    const user = req.body;
    const { responsable } = user;
    const { login, usuario, perfil } = jwt.verify(token, secret);
    if (responsable !== login) {
      return res.status(401).send({
        estado: false,
        detalle: "Inicie sesión nuevamente. Token expirado.",
        retorno: 0,
      });
    }
    const response = await pool.query(
      `
      UPDATE bd_seguridad.seg_t_usuario
      SET identificacion = '${user.identificacion}'
      , nombres = '${user.nombres}'
      , "apellidoPaterno" = '${user.apellidoPaterno}'
      , "apellidoMaterno" = '${user.apellidoMaterno}'
      , "idPais" = ${user.idPais}
      , telefono = '${user.telefono}'
      , correo = '${user.correo}'
      , "idResponsable" = '${user.idResponsable}'
      , "idPerfil" = '${user.idPerfil}'
      , activo = '${user.activo}'::"bit"
      , fechaActualizacion = NOW()
      , responsableActualizacion = '${user.responsable}'
      WHERE id = '${user.id}'
      AND EXISTS (
        SELECT id FROM bd_seguridad.seg_t_usuario
        WHERE correo = '${user.responsable}'
        AND "idPerfil" IN (1, 2)
      );`
    );
    let query = "";
    if (perfil === "1") {
      // Si es Administrador se obtiene el usuario.
      query = `SELECT
      id, "idPerfil", identificacion, nombres, "apellidoPaterno", "apellidoMaterno", "idPais", "idCiudad", telefono, correo, password, "idResponsable"
      , activo, eliminado, fechaCreacion, responsableCreacion, fechaActualizacion, responsableActualizacion
      FROM bd_seguridad.seg_t_usuario
      WHERE EXISTS (
        SELECT id FROM bd_seguridad.seg_t_usuario
        WHERE correo = '${user.responsable}'
        AND "idPerfil" IN (1, 2)
      )
      AND id = '${user.id}';`;
    } else if (perfil === "2") {
      // Si es Supervisor se obtiene el usuario solo si este esta asociado al supervisor que realiza la consulta.
      query = `SELECT
      id, "idPerfil", identificacion, nombres, "apellidoPaterno", "apellidoMaterno", "idPais", "idCiudad", telefono, correo, password, "idResponsable"
      , activo, eliminado, fechaCreacion, responsableCreacion, fechaActualizacion, responsableActualizacion
      FROM bd_seguridad.seg_t_usuario
      WHERE EXISTS (
        SELECT id FROM bd_seguridad.seg_t_usuario
        WHERE correo = '${user.responsable}'
        AND "idPerfil" IN (1, 2)
      )
      AND id = '${user.id}' AND "idResponsable" = '${usuario}';`;
    }
    const responseUsuario = await pool.query(query);
    const { rows } = responseUsuario;
    const retorno = {
      estado: true,
      detalle: "Usuario actualizado correctamente.",
      retorno: rows[0],
    };
    res.send(retorno);
  } catch (e) {
    res.status(400).send({
      estado: false,
      detalle: "Lo sentimos, ocurrio un error.",
      retorno: e.message,
    });
  }
};

export const sendResetPassword = async (req, res) => {
  try {
    const { correo, responsable } = req.body;
    if (correo === undefined || responsable === undefined) {
      res.status(400).send({
        estado: false,
        detalle:
          "No fue posible enviar el correo para el restablecimiento de contraseña.",
        retorno: "Parametros no definidos.",
      });
    } else {
      let query = "";
      // 1. Desactivar anteriores solicitudes de reseteo del usuario.
      query = `
    UPDATE bd_seguridad.seg_t_usuariopwdreset
    SET activo = '0'::"bit",
    fechaactualizacion = NOW(),
    responsableactualizacion = '${responsable}'
    WHERE "idUsuario" = (SELECT id FROM bd_seguridad.seg_t_usuario WHERE correo = '${correo}' AND eliminado = '0'::"bit")
    AND activo = '1'::"bit";
    `;
      const responseSolicitudes = await pool.query(query);
      const { rowsSolicitudes } = responseSolicitudes;
      // 2. Desactivar el usuario.
      query = `
    UPDATE bd_seguridad.seg_t_usuario
    SET activo = '0'::"bit", fechaactualizacion = NOW(), responsableactualizacion = '${responsable}'
    WHERE correo = '${correo}' AND activo = '1'::"bit";
    `;
      const responseUsuario = await pool.query(query);
      const { rowsUsuario } = responseUsuario;
      // 3. Insertar registro de solicitud de reseteo de contraseña.
      query = `
    INSERT INTO bd_seguridad.seg_t_usuariopwdreset ("idUsuario", responsablecreacion, responsableactualizacion)
    SELECT id, '${responsable}' responsablecreacion, '${responsable}' responsableactualizacion
    FROM bd_seguridad.seg_t_usuario WHERE correo = '${correo}'
    AND activo = '0'::"bit";
    `;
      const responseSolicitud = await pool.query(query);
      const { rowsSolicitud } = responseSolicitud;
      //4. Obtener información para enviar notificación con el link de reseteo.
      query = `
    SELECT S.id, S."idUsuario", correo, U.nombres, U."apellidoPaterno", U."apellidoMaterno", S.activo, "fechaSolicitud", "fechaVigencia"
    FROM bd_seguridad.seg_t_usuariopwdreset S
    INNER JOIN bd_seguridad.seg_t_usuario U ON (S."idUsuario" = U.id AND U.activo = '0'::"bit")
    WHERE S."idUsuario" = (SELECT id FROM bd_seguridad.seg_t_usuario WHERE correo = '${correo}' AND eliminado = '0'::"bit") 
    AND S.activo = '1'::"bit"
    AND (((DATE_PART('day', "fechaVigencia"::timestamp - NOW()::timestamp) * 24 + 
    DATE_PART('hour', "fechaVigencia"::timestamp - NOW()::timestamp)) * 60 +
    DATE_PART('minute', "fechaVigencia"::timestamp - NOW()::timestamp)) > 0) = true;
    `;
      const responseSolicitudNotificacion = await pool.query(query);
      const { rows } = responseSolicitudNotificacion;
      // Enviar email con link para reseteo de contraseña.
      if (rows.length > 0) {
        const cuerpoMensaje = `
<span><strong>BYDZYNE</strong></span><br /><br />
Estimado/a ${rows[0].nombres} ${rows[0].apellidoPaterno} ${rows[0].apellidoMaterno},
<br /><br />
Para restablecer tu contraseña, da clic en el siguiente enlace y registra tu nueva contraseña.
<br /><br />
<a target='_blank' href='${baseURL}/#/resetpassword/${rows[0].id}/reset'>Restablecer Contraseña</a>
<br /><br />
Si tienes dudas o deseas nuestro acompañamiento no dudes en contactarnos.
<br /><br />
Atentamente,<br />
<span><strong>SISTEMA EQUIPO PRO</strong></span>
      `;
        enviar({
          to: rows[0].correo,
          subject: "Restablece tu Contraseña - SISTEMA EQUIPO PRO",
          html: cuerpoMensaje,
        });
      }
      // Envio de correo.
      res.send({
        retorno: rows[0],
        estado: true,
        detalle:
          "El correo para el restablecimiento de contraseña fue enviado exitosamente.",
      });
    }
  } catch (e) {
    res.status(400).send({
      estado: false,
      detalle: "Lo sentimos, ocurrio un error.",
      retorno: e.message,
    });
  }
};

export const getResetPassword = async (req, res) => {
  try {
    const { id } = req.body;
    const query = `
    SELECT S.id, S."idUsuario", correo, U.nombres, U."apellidoPaterno", U."apellidoMaterno", S.activo, "fechaSolicitud", "fechaVigencia"
    FROM bd_seguridad.seg_t_usuariopwdreset S
    INNER JOIN bd_seguridad.seg_t_usuario U ON (S."idUsuario" = U.id AND U.activo = '0'::"bit")
    WHERE S.id = '${id}' AND S.activo = '1'::"bit"
    AND (((DATE_PART('day', "fechaVigencia"::timestamp - NOW()::timestamp) * 24 + 
    DATE_PART('hour', "fechaVigencia"::timestamp - NOW()::timestamp)) * 60 +
    DATE_PART('minute', "fechaVigencia"::timestamp - NOW()::timestamp)) > 0) = true;
    `;
    const response = await pool.query(query);
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

export const resetPassword = async (req, res) => {
  try {
    const { id, password, passwordConfirm } = req.body;
    if (
      id === undefined ||
      password === undefined ||
      passwordConfirm === undefined
    ) {
      res.status(400).send({
        estado: false,
        detalle: "No fue posible restablecer la contraseña.",
        retorno: "Parametros no definidos.",
      });
    } else {
      if (password !== passwordConfirm) {
        res.status(400).send({
          estado: false,
          detalle: "No fue posible restablecer la contraseña.",
          retorno: "Las contraseñas no coinciden.",
        });
      } else {
        const query = `
        UPDATE bd_seguridad.seg_t_usuario
        SET password = MD5('${password}')
        , activo = '1'::"bit"
        , fechaActualizacion = NOW()
        , responsableActualizacion = (
          SELECT U.correo
          FROM bd_seguridad.seg_t_usuariopwdreset S
          INNER JOIN bd_seguridad.seg_t_usuario U ON (S."idUsuario" = U.id AND U.activo = '0'::"bit")
          WHERE S.id = '${id}' AND S.activo = '1'::"bit"
          AND (((DATE_PART('day', "fechaVigencia"::timestamp - NOW()::timestamp) * 24 + 
          DATE_PART('hour', "fechaVigencia"::timestamp - NOW()::timestamp)) * 60 +
          DATE_PART('minute', "fechaVigencia"::timestamp - NOW()::timestamp)) > 0) = true
        )
        WHERE id = (
          SELECT "idUsuario"
          FROM bd_seguridad.seg_t_usuariopwdreset
          WHERE id = '${id}'
          AND activo = '1'::"bit"
          AND (((DATE_PART('day', "fechaVigencia"::timestamp - NOW()::timestamp) * 24 + 
          DATE_PART('hour', "fechaVigencia"::timestamp - NOW()::timestamp)) * 60 +
          DATE_PART('minute', "fechaVigencia"::timestamp - NOW()::timestamp)) > 0) = true
        )
        AND activo = '0'::"bit";
    `;
        const response = await pool.query(query);
        const queryReset = `
        UPDATE bd_seguridad.seg_t_usuariopwdreset
        SET activo = '0'::"bit",
        fechaactualizacion = NOW(),
        responsableactualizacion = (
          SELECT U.correo
          FROM bd_seguridad.seg_t_usuariopwdreset S
          INNER JOIN bd_seguridad.seg_t_usuario U ON (S."idUsuario" = U.id AND U.activo = '1'::"bit")
          WHERE S.id = '${id}' AND S.activo = '1'::"bit"
          AND (((DATE_PART('day', "fechaVigencia"::timestamp - NOW()::timestamp) * 24 + 
          DATE_PART('hour', "fechaVigencia"::timestamp - NOW()::timestamp)) * 60 +
          DATE_PART('minute', "fechaVigencia"::timestamp - NOW()::timestamp)) > 0) = true
        )
        WHERE id = '${id}'
        AND activo = '1'::"bit"
        AND (((DATE_PART('day', "fechaVigencia"::timestamp - NOW()::timestamp) * 24 + 
        DATE_PART('hour', "fechaVigencia"::timestamp - NOW()::timestamp)) * 60 +
        DATE_PART('minute', "fechaVigencia"::timestamp - NOW()::timestamp)) > 0) = true;
        `;
        const responseReset = await pool.query(queryReset);
        const retorno = {
          estado: true,
          detalle: "La contraseña se cambio exitosamente.",
          retorno: {
            id,
          },
        };
        res.send(retorno);
      }
    }
  } catch (e) {
    res.status(400).send({
      estado: false,
      detalle: "Lo sentimos, ocurrio un error.",
      retorno: e.message,
    });
  }
};
