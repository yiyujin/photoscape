import './App.css';
import { Navigate, Routes, Route } from "react-router-dom";

import Ending from './Ending';
// import WebCamThumbnail from './WebCamThumbnail';
// import Test8 from './Test8';

export default function App() {
  return (
    <div className = "App">
      {/* <RippleMany/> */}
      {/* <RippleGrid/> */}

      {/* <hr/> */}

      {/* <Ending/> */}
      {/* <Test6/> */}
      {/* <Test7/> */}
      {/* <WebCamThumbnail /> */}
        
      <Routes> 
        {/* <Route path = "/" element = { <Test8/> } /> */}
        <Route path = "/ending" element = { <Ending/>}/>
      </Routes>
      
    </div>
  )
}