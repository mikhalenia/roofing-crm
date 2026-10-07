import { Route, Routes } from "react-router-dom";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<h1>Roofing CRM</h1>} />
    </Routes>
  );
}

export default App;
