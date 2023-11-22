import dotenv from "dotenv";
dotenv.config();

export const getPgSettings = () => ({
  host: process.env.HOST,
  user: process.env.USER,
  password: process.env.PASSWORD,
  database: process.env.DATABASE,
  port: process.env.PUERTO,
});

export const getSecretKEY = () => process.env.SECRET;
export const getBaseURL = () => process.env.BASEURL;
export const getWebSite = () => process.env.WEBSITE;
