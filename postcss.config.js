// Tailwind se retiro con `main.css`: FIERRO no usa utilidades, usa tokens y
// clases con nombre. Queda autoprefixer, que si hace falta para los prefijos
// de -webkit- en Safari/iOS.
export default {
  plugins: {
    autoprefixer: {},
  },
};
