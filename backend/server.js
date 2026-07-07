const authRoute =
require("./routes/auth");

const masterRoute=require("./routes/master")
const importRoutes = require("./routes/importRoutes");
const deviceRoute = require("./routes/devices");
const importRoute = require("./routes/import");

app.use("/api/devices", deviceRoute);
app.use("/api", importRoute);

app.use(
"/api",
masterRoute
)

app.use(
"/api/auth",
authRoute
);