// The basic Plotly bundle (scatter/bar/pie, 1.2 MB instead of 4.6 MB) has the same API.
declare module "plotly.js-basic-dist-min" {
  import Plotly from "plotly.js-dist-min";
  export default Plotly;
}
