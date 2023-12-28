import dotenv from "dotenv";
dotenv.config();

export const getPgSettings = () => ({
  host: "127.0.0.1",
  user: "postgres",
  password: "postgres",
  database: "db_bydzyne",
  port: 5432,
});

export const getSecretKEY = () =>
  "00dc77e9beaebaafe0f123966099ced05b2dc23a90c23da959ae36fd675cb10dabbdf6ccdcc5cd35c2e754ccf3e606e2205e0122c1eeec27e5b116c213f04773";
export const getBaseURL = () => "https://www.sistemaequipopro.com";
export const getWebSite = () => "https://www.sistemaequipopro.com";
