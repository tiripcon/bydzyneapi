import express from "express";
import bodyParser from "body-parser";

import userRoutes from "./routes/users.js";
import supervisorRoutes from "./routes/supervisores.js";
import paisRoutes from "./routes/paises.js";
import perfilRoutes from "./routes/perfiles.js";

const app = express();
const PORT = 3001;

app.use(bodyParser.json());

app.use("/users", userRoutes);
app.use("/supervisores", supervisorRoutes);
app.use("/catalogos", paisRoutes);
app.use("/perfiles", perfilRoutes);

app.get("/", (req, res) => {
  const html =
    '<html><head><title>RestAPI para BYDEZYNE</title></head><body style="padding: 40px 40px; text-align: center;"><div style="font-family: Arial;"><h2>Bienvenidos</h2><p>RestAPI BYDZYNE</p></div></body></html>';
  res.send(html);
});

app.listen(PORT, () =>
  console.log(`Server Running on Port: http://localhost:${PORT}`)
);
