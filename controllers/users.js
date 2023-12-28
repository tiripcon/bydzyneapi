import jwt from "jsonwebtoken";
import pg from "pg";
import { v4 as uuidv4 } from "uuid";
import requestIP from "request-ip";
import browser from "browser-detect";

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
    const remoteIP = requestIP.getClientIp(req);
    const deviceInfo = JSON.stringify(browser(req.headers["user-agent"]));
    const { login, password } = req.body;
    const response = await pool.query(
      `SELECT
    id, "idPerfil", identificacion, nombres, "apellidoPaterno", "apellidoMaterno", "idPais", "idCiudad", telefono, correo, password, "idResponsable"
    , activo, eliminado, fechaCreacion, responsableCreacion, fechaActualizacion, responsableActualizacion
    FROM bd_seguridad.seg_t_usuario
    WHERE activo = '1'::"bit" AND eliminado = '0'::"bit" AND "idPerfil" IS NOT NULL AND correo = '${login}' AND password = MD5('${password}')`
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

      const responseActive = await pool.query(
        `UPDATE bd_seguridad.seg_t_usuariologin SET activo = false WHERE "idUsuario" = '${usuario}';`
      );

      const responseLogin = await pool.query(
        `INSERT INTO bd_seguridad.seg_t_usuariologin ("idUsuario", fecha, ip, dispositivo, activo) SELECT '${usuario}' AS "idUsuario", now() AS fecha, '${remoteIP}' AS ip, '${deviceInfo}' AS dispositivo, true AS activo;`
      );

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
        ) AND "idPerfil" IN (1, 2) AND id NOT IN ('1377dfd5-f7e1-408a-80ec-67b270ec23dc','4ffc0fc9-6386-4911-81cb-4fb524de7fa2');`;
      } else if (perfil === "2") {
        // Si es usuario Supervisor se obtiene solo el usuario supervisor que hacer solicitud de autenticación.
        query = `SELECT
        id, nombres || ' ' || "apellidoPaterno" || ' ' || "apellidoMaterno" nombres
        FROM bd_seguridad.seg_t_usuario
        WHERE EXISTS (
          SELECT id FROM bd_seguridad.seg_t_usuario WHERE correo = '${login}' AND "idPerfil" IN (1, 2)
        ) AND "idPerfil" IN (1, 2) AND id = '${usuario}' AND id NOT IN ('1377dfd5-f7e1-408a-80ec-67b270ec23dc','4ffc0fc9-6386-4911-81cb-4fb524de7fa2');`;
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
      (id, "idPerfil", identificacion, nombres, "apellidoPaterno", "apellidoMaterno", "idPais", telefono, correo, password, "idResponsable", activo, eliminado, responsablecreacion, responsableactualizacion)
      SELECT '${userWithId.id}' id, 3 "idPerfil",'${userWithId.identificacion}' "identificacion", '${userWithId.nombres}' nombres, '${userWithId.apellidoPaterno}' "apellidoPaterno"
      , '${userWithId.apellidoMaterno}' "apellidoMaterno", ${userWithId.idPais} idPais, '${userWithId.telefono}' telefono
      , '${userWithId.correo}' correo, MD5('${userWithId.password}') AS password
      , '${userWithId.idResponsable}' idResponsable
      , '0'::"bit" activo
      , '1'::"bit" eliminado
      , '${userWithId.identificacion}' responsablecreacion, '${userWithId.identificacion}' responsableactualizacion;
      `
    );

    const responseSolicitud = await pool.query(`
    INSERT INTO bd_seguridad.seg_t_usuariosolicitud ("idUsuario", "fechaSolicitud", "idUsuarioResponsable")
    VALUES ('${userWithId.id}',now(),'${userWithId.idResponsable}');
    `);

    const responseUsuario = await pool.query(
      `SELECT U.nombres, U."apellidoPaterno", U."apellidoMaterno", U.correo
      , P.nombres AS "nombresResponsable", P."apellidoPaterno" AS "apellidoPaternoResponsable", P."apellidoMaterno" AS "apellidoMaternoResponsable", P.correo AS "correoResponsable"
      FROM bd_seguridad.seg_t_usuario AS U
      INNER JOIN bd_seguridad.seg_t_usuario AS P ON (U."idResponsable" = P.id AND P."idPerfil" IN (1, 2))
      WHERE U.id = '${userWithId.id}'
      AND U.activo = '0'::"bit" AND U.eliminado = '1'::"bit";`
    );
    const { rows } = responseUsuario;

    // Notificar solicitud de aprobación de registro.
    if (rows.length > 0) {
      const cuerpoMensaje = `
      <span><strong>BYDZYNE</strong></span><br /><br />
Estimado/a ${rows[0].nombres} ${rows[0].apellidoPaterno} ${rows[0].apellidoMaterno},
<br /><br />
Gracias por registrarse en Sistema Equipo Pro.
<br /><br />
Su solicitud se encuentra en proceso de aprobación.
<br /><br />
Cualquier novedad por favor contactarse con ${rows[0].nombresResponsable} ${rows[0].apellidoPaternoResponsable} ${rows[0].apellidoMaternoResponsable}.
<br /><br />
Atentamente,<br />
<span><strong>SISTEMA EQUIPO PRO</strong></span>
      `;
      enviar({
        to: rows[0].correo,
        subject: "Solicitud de Aprobación de Registro",
        html: cuerpoMensaje,
      });
      const cuerpoMensajePresidente = `
      <span><strong>BYDZYNE</strong></span><br /><br />
Estimado/a ${rows[0].nombresResponsable} ${rows[0].apellidoPaternoResponsable} ${rows[0].apellidoMaternoResponsable},
<br /><br />
${rows[0].nombres} ${rows[0].apellidoPaterno} ${rows[0].apellidoMaterno} le ha enviado una solicitud de acceso.
<br /><br />
Para aprobar o rechazar la solicitud ingrese a <a target='_blank' href='${baseURL}'>${webSite}</a>
<br /><br />
Atentamente,<br />
<span><strong>SISTEMA EQUIPO PRO</strong></span>
      `;
      enviar({
        to: rows[0].correoResponsable,
        subject: "Solicitud de Aprobación de Registro",
        html: cuerpoMensajePresidente,
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

export const gets = async (req, res) => {
  try {
    const { responsable } = req.params;
    const { estado, identificacion, nombres, correo, presidente } = req.query;
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
      (SELECT CASE WHEN COUNT(S."fechaSolicitud") = 1 THEN 1 ELSE 0 END AS total FROM bd_seguridad.seg_t_usuariosolicitud AS S WHERE S."idUsuario" = U.id AND S."fechaRespuesta" IS NULL) AS "existeSolicitudPendiente"
      , (SELECT S."fechaRespuesta" FROM bd_seguridad.seg_t_usuariosolicitud AS S WHERE S."idUsuario" = U.id AND S."fechaRespuesta" IS NOT NULL) AS "fechaRespuesta"
      , (SELECT S."estadoRespuesta" FROM bd_seguridad.seg_t_usuariosolicitud AS S WHERE S."idUsuario" = U.id AND S."fechaRespuesta" IS NOT NULL) AS "estadoRespuesta",
      U.id, U."idPerfil", U.identificacion, U.nombres, U."apellidoPaterno", U."apellidoMaterno", U."idPais", U."idCiudad", U.telefono, U.correo, U.password
      , U."idResponsable", R.nombres || ' ' || R."apellidoPaterno" || ' ' || R."apellidoMaterno" "nombreResponsable"
      , L.fecha AS "fechaUltimoLogin"
      , U.activo, U.eliminado, U.fechaCreacion, U.responsableCreacion, U.fechaActualizacion, U.responsableActualizacion
      FROM bd_seguridad.seg_t_usuario AS U
      LEFT JOIN bd_seguridad.seg_t_usuario AS R ON (U."idResponsable" = R.id)
      LEFT JOIN (
        SELECT * FROM bd_seguridad.seg_t_usuariologin WHERE activo = true
      ) AS L ON (U.id = L."idUsuario")
      WHERE EXISTS (
        SELECT id FROM bd_seguridad.seg_t_usuario WHERE correo = '${responsable}' AND "idPerfil" IN (1, 2)
        ) AND U.id NOT IN ('1377dfd5-f7e1-408a-80ec-67b270ec23dc','4ffc0fc9-6386-4911-81cb-4fb524de7fa2')`;
    } else if (perfil === "2") {
      // Si es Supervisor se consultan solo los usuarios asociados.
      query = `SELECT
      (SELECT CASE WHEN COUNT(S."fechaSolicitud") = 1 THEN 1 ELSE 0 END AS total FROM bd_seguridad.seg_t_usuariosolicitud AS S WHERE S."idUsuario" = U.id AND S."fechaRespuesta" IS NULL) AS "existeSolicitudPendiente"
      , (SELECT S."fechaRespuesta" FROM bd_seguridad.seg_t_usuariosolicitud AS S WHERE S."idUsuario" = U.id AND S."fechaRespuesta" IS NOT NULL) AS "fechaRespuesta"
      , (SELECT S."estadoRespuesta" FROM bd_seguridad.seg_t_usuariosolicitud AS S WHERE S."idUsuario" = U.id AND S."fechaRespuesta" IS NOT NULL) AS "estadoRespuesta",
      U.id, U."idPerfil", U.identificacion, U.nombres, U."apellidoPaterno", U."apellidoMaterno", U."idPais", U."idCiudad", U.telefono, U.correo, U.password
      , U."idResponsable", R.nombres || ' ' || R."apellidoPaterno" || ' ' || R."apellidoMaterno" "nombreResponsable"
      , L.fecha AS "fechaUltimoLogin"
      , U.activo, U.eliminado, U.fechaCreacion, U.responsableCreacion, U.fechaActualizacion, U.responsableActualizacion
      FROM bd_seguridad.seg_t_usuario AS U
      LEFT JOIN bd_seguridad.seg_t_usuario AS R ON (U."idResponsable" = R.id)
      LEFT JOIN (
        SELECT * FROM bd_seguridad.seg_t_usuariologin WHERE activo = true
      ) AS L ON (U.id = L."idUsuario")
      WHERE EXISTS (
        SELECT id FROM bd_seguridad.seg_t_usuario WHERE correo = '${responsable}' AND "idPerfil" IN (1, 2)
      )
      AND U.id NOT IN ('1377dfd5-f7e1-408a-80ec-67b270ec23dc','4ffc0fc9-6386-4911-81cb-4fb524de7fa2')
      AND U."idResponsable" = '${usuario}'`;
    }

    if (
      estado !== undefined &&
      estado !== null &&
      (estado === "1" || estado === "0")
    ) {
      query += ` AND U.activo = '${estado}'`;
    } else if (estado === "3") {
      query += ` AND U.eliminado = '1'::"bit" AND U.id IN (SELECT "idUsuario" FROM bd_seguridad.seg_t_usuariosolicitud AS S WHERE S."fechaRespuesta" IS NULL AND "responsableRespuesta" IS NULL AND "estadoRespuesta" IS NULL)`;
    }

    if (nombres !== undefined && nombres !== null && nombres !== "") {
      query += ` AND CONCAT(U.nombres, ' ', U."apellidoPaterno", ' ', U."apellidoMaterno") LIKE '%${nombres}%'`;
    }

    if (
      identificacion !== undefined &&
      identificacion !== null &&
      identificacion !== ""
    ) {
      query += ` AND U.identificacion LIKE '%${identificacion}%'`;
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
      (SELECT CASE WHEN COUNT(S."fechaSolicitud") = 1 THEN 1 ELSE 0 END AS total FROM bd_seguridad.seg_t_usuariosolicitud AS S WHERE S."idUsuario" = U.id AND S."fechaRespuesta" IS NULL) AS "existeSolicitudPendiente"
      , (SELECT S."fechaRespuesta" FROM bd_seguridad.seg_t_usuariosolicitud AS S WHERE S."idUsuario" = U.id AND S."fechaRespuesta" IS NOT NULL) AS "fechaRespuesta"
      , (SELECT S."estadoRespuesta" FROM bd_seguridad.seg_t_usuariosolicitud AS S WHERE S."idUsuario" = U.id AND S."fechaRespuesta" IS NOT NULL) AS "estadoRespuesta",
      id, "idPerfil", identificacion, nombres, "apellidoPaterno", "apellidoMaterno", "idPais", "idCiudad", telefono, correo, password, "idResponsable"
      , activo, eliminado, fechaCreacion, responsableCreacion, fechaActualizacion, responsableActualizacion
      FROM bd_seguridad.seg_t_usuario AS U
      WHERE EXISTS (
        SELECT id FROM bd_seguridad.seg_t_usuario
        WHERE correo = '${responsable}' AND "idPerfil" IN (1, 2)
      )
      AND id = '${id}';`;
    } else if (perfil === "2") {
      // Si es Supervisor se obtiene el usuario solo si este esta asociado al supervisor que realiza la consulta.
      query = `SELECT
      (SELECT CASE WHEN COUNT(S."fechaSolicitud") = 1 THEN 1 ELSE 0 END AS total FROM bd_seguridad.seg_t_usuariosolicitud AS S WHERE S."idUsuario" = U.id AND S."fechaRespuesta" IS NULL) AS "existeSolicitudPendiente"
      , (SELECT S."fechaRespuesta" FROM bd_seguridad.seg_t_usuariosolicitud AS S WHERE S."idUsuario" = U.id AND S."fechaRespuesta" IS NOT NULL) AS "fechaRespuesta"
      , (SELECT S."estadoRespuesta" FROM bd_seguridad.seg_t_usuariosolicitud AS S WHERE S."idUsuario" = U.id AND S."fechaRespuesta" IS NOT NULL) AS "estadoRespuesta",
      id, "idPerfil", identificacion, nombres, "apellidoPaterno", "apellidoMaterno", "idPais", "idCiudad", telefono, correo, password, "idResponsable"
      , activo, eliminado, fechaCreacion, responsableCreacion, fechaActualizacion, responsableActualizacion
      FROM bd_seguridad.seg_t_usuario AS U
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

const existeSolitudVigente = async (correo) => {
  const retorno = false;
  const query = `
  SELECT S.id, S."idUsuario", correo, U.nombres, U."apellidoPaterno", U."apellidoMaterno", S.activo, "fechaSolicitud", "fechaVigencia"
  FROM bd_seguridad.seg_t_usuariopwdreset S
  INNER JOIN bd_seguridad.seg_t_usuario U ON (S."idUsuario" = U.id AND U.eliminado = '0'::"bit")
  WHERE S."idUsuario" = (SELECT id FROM bd_seguridad.seg_t_usuario WHERE correo = '${correo}' AND eliminado = '0'::"bit") 
  AND S.activo = '1'::"bit"
  AND (((DATE_PART('day', "fechaVigencia"::timestamp - NOW()::timestamp) * 24 + 
  DATE_PART('hour', "fechaVigencia"::timestamp - NOW()::timestamp)) * 60 +
  DATE_PART('minute', "fechaVigencia"::timestamp - NOW()::timestamp)) > 0) = true;
  `;
  const responseSolicitudVigente = await pool.query(query);
  const { rows } = responseSolicitudVigente;
  return rows.length > 0;
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

      // 1. Si no existe una solicitud vigente se inserta el registro.
      const response = await existeSolitudVigente(correo);
      if (!response) {
        query = `
      INSERT INTO bd_seguridad.seg_t_usuariopwdreset ("idUsuario", responsablecreacion, responsableactualizacion)
      SELECT id, '${responsable}' responsablecreacion, '${responsable}' responsableactualizacion
      FROM bd_seguridad.seg_t_usuario WHERE correo = '${correo}'
      AND eliminado = '0'::"bit";
      `;
        const responseSolicitud = await pool.query(query);
        const { rowsSolicitud } = responseSolicitud;
      }

      // 2. Obtener información para enviar notificación con el link de reseteo.
      query = `
    SELECT S.id, S."idUsuario", correo, U.nombres, U."apellidoPaterno", U."apellidoMaterno", S.activo, "fechaSolicitud", "fechaVigencia"
    FROM bd_seguridad.seg_t_usuariopwdreset S
    INNER JOIN bd_seguridad.seg_t_usuario U ON (S."idUsuario" = U.id AND U.eliminado = '0'::"bit")
    WHERE S."idUsuario" = (SELECT id FROM bd_seguridad.seg_t_usuario WHERE correo = '${correo}' AND eliminado = '0'::"bit") 
    AND S.activo = '1'::"bit"
    AND (((DATE_PART('day', "fechaVigencia"::timestamp - NOW()::timestamp) * 24 + 
    DATE_PART('hour', "fechaVigencia"::timestamp - NOW()::timestamp)) * 60 +
    DATE_PART('minute', "fechaVigencia"::timestamp - NOW()::timestamp)) > 0) = true;
    `;
      const responseSolicitudNotificacion = await pool.query(query);
      const { rows } = responseSolicitudNotificacion;

      //3. Enviar email con link para reseteo de contraseña.
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
    INNER JOIN bd_seguridad.seg_t_usuario U ON (S."idUsuario" = U.id AND U.eliminado = '0'::"bit")
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
        , fechaActualizacion = NOW()
        , responsableActualizacion = (
          SELECT U.correo
          FROM bd_seguridad.seg_t_usuariopwdreset S
          INNER JOIN bd_seguridad.seg_t_usuario U ON (S."idUsuario" = U.id AND U.activo = '1'::"bit" AND U.eliminado = '0'::"bit")
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
        AND eliminado = '0'::"bit";
    `;
        const response = await pool.query(query);
        const queryReset = `
        UPDATE bd_seguridad.seg_t_usuariopwdreset
        SET activo = '0'::"bit",
        fechaactualizacion = NOW(),
        responsableactualizacion = (
          SELECT U.correo
          FROM bd_seguridad.seg_t_usuariopwdreset S
          INNER JOIN bd_seguridad.seg_t_usuario U ON (S."idUsuario" = U.id AND U.activo = '1'::"bit" AND U.eliminado = '0'::"bit")
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

export const updateRequest = async (req, res) => {
  try {
    const token = req.headers.authorization.split(" ")[1];
    const request = req.body;
    const { id, idResponsable, responsable, estadoRespuesta } = request;
    const { login, usuario, perfil } = jwt.verify(token, secret);
    if (responsable !== login) {
      return res.status(401).send({
        estado: false,
        detalle: "Inicie sesión nuevamente. Token expirado.",
        retorno: 0,
      });
    }
    const responseSolicitud = await pool.query(
      `
      UPDATE bd_seguridad.seg_t_usuariosolicitud
      SET "fechaRespuesta" = NOW()
      , "responsableRespuesta" = '${responsable}'
      , "estadoRespuesta" = ${estadoRespuesta}
      FROM bd_seguridad.seg_t_usuariosolicitud AS A
      INNER JOIN bd_seguridad.seg_t_usuario AS B ON (A."idUsuario" = B."id" AND B.activo = '0'::"bit" AND B.eliminado = '1'::"bit")
      WHERE A."idUsuario" = '${id}' AND A."idUsuarioResponsable" = '${idResponsable}'
      AND A."fechaRespuesta" IS NULL AND A."responsableRespuesta" IS NULL AND A."estadoRespuesta" IS NULL;
      `
    );

    if (estadoRespuesta === true) {
      const responseUsuarioActualizado = await pool.query(
        `
      UPDATE bd_seguridad.seg_t_usuario
      SET activo = '1'::"bit", eliminado = '0'::"bit"
      , fechaActualizacion = NOW()
      , responsableActualizacion = '${responsable}'
      WHERE id = '${id}'
      AND activo = '0'::"bit"
      AND eliminado = '1'::"bit";
      `
      );
    }

    let query = "";
    if (perfil === "1") {
      // Si es Administrador se obtiene el usuario.
      query = `SELECT U.nombres, U."apellidoPaterno", U."apellidoMaterno", U.correo
      , P.nombres AS "nombresResponsable", P."apellidoPaterno" AS "apellidoPaternoResponsable", P."apellidoMaterno" AS "apellidoMaternoResponsable", P.correo AS "correoResponsable"
      FROM bd_seguridad.seg_t_usuario AS U
      INNER JOIN bd_seguridad.seg_t_usuario AS P ON (U."idResponsable" = P.id AND P."idPerfil" IN (1, 2))
      WHERE EXISTS (
        SELECT id FROM bd_seguridad.seg_t_usuario
        WHERE correo = '${responsable}' AND "idPerfil" IN (1, 2)
      )
      AND U.id = '${id}'`;
    } else if (perfil === "2") {
      // Si es Supervisor se obtiene el usuario solo si este esta asociado al supervisor que realiza la consulta.
      query = `SELECT U.nombres, U."apellidoPaterno", U."apellidoMaterno", U.correo
      , P.nombres AS "nombresResponsable", P."apellidoPaterno" AS "apellidoPaternoResponsable", P."apellidoMaterno" AS "apellidoMaternoResponsable", P.correo AS "correoResponsable"
      FROM bd_seguridad.seg_t_usuario AS U
      INNER JOIN bd_seguridad.seg_t_usuario AS P ON (U."idResponsable" = P.id AND P."idPerfil" IN (1, 2))
      WHERE EXISTS (
        SELECT id FROM bd_seguridad.seg_t_usuario
        WHERE correo = '${responsable}' AND "idPerfil" IN (1, 2)
      )
      AND U.id = '${id}' AND U."idResponsable" = '${idResponsable}'`;
    }
    if (estadoRespuesta === true) {
      query += ` AND U.activo = '1'::"bit" AND U.eliminado = '0'::"bit";`;
    }
    if (estadoRespuesta === false) {
      query += ` AND U.activo = '0'::"bit" AND U.eliminado = '1'::"bit";`;
    }
    const responseUsuario = await pool.query(query);
    const { rows } = responseUsuario;

    // Notificar de creación de accesos para la plataforma
    if (rows.length > 0) {
      const cuerpoMensaje =
        estadoRespuesta === true
          ? `
      <span><strong>BYDZYNE</strong></span><br /><br />
Estimado/a ${rows[0].nombres} ${rows[0].apellidoPaterno} ${rows[0].apellidoMaterno},
<br /><br />
¡Bienvenido/a al camino del emprendimiento!
<br /><br />
Su solicitud de acceso fue aprobada.
<br /><br />
<span><strong>Link:</strong></span> <a target='_blank' href='${baseURL}'>${webSite}</a>
<br /><br />
Si tienes dudas o deseas nuestro acompañamiento no dudes en contactarnos.
<br /><br />
Atentamente,<br />
<span><strong>SISTEMA EQUIPO PRO</strong></span>
      `
          : `
      <span><strong>BYDZYNE</strong></span><br /><br />
Estimado/a ${rows[0].nombres} ${rows[0].apellidoPaterno} ${rows[0].apellidoMaterno},
<br /><br />
Su solicitud de acceso fue rechazada.
<br /><br />
Cualquier novedad por favor contactarse con ${rows[0].nombresResponsable} ${rows[0].apellidoPaternoResponsable} ${rows[0].apellidoMaternoResponsable}.
<br /><br />
Atentamente,<br />
<span><strong>SISTEMA EQUIPO PRO</strong></span>
      `;
      enviar({
        to: rows[0].correo,
        subject: `Solicitud de Registro ${
          estadoRespuesta === true ? "Aprobada" : "Rechazada"
        }`,
        html: cuerpoMensaje,
      });
    }

    const retorno = {
      estado: true,
      detalle: `Solicitud ${
        estadoRespuesta === true ? "aprobada" : "rechazada"
      } correctamente.`,
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
