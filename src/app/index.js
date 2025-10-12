import 'dotenv/config';
import { composeApp } from './compose.js';

const port = Number(process.env.PORT ?? 8080);
const app = composeApp();

app.listen(port, () => {
  console.log(`PantryPilot listening on http://localhost:${port}`);
});
