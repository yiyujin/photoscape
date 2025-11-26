import './App.css';
import { Navigate, Routes, Route } from "react-router-dom";

import Test from './Test';
import Test2 from './Test2';
import Test3 from './Test3';
import Test4 from './Test4';
import RippleTest from './RippleTest';
import MirrorVideo from './MirrorVideo';
import RippleOne from './RippleOne';
import Test5 from './Test5';
import RippleMany from './RippleMany';
import Test6 from './Test6';
import Ending from './Ending';
import RippleGrid from './RippleGrid';
import Test7 from './Test7';
import WebCamThumbnail from './WebCamThumbnail';
import Test8 from './Test8';

export default function App() {
  return (
    <div className = "App">
      {/* <RippleMany/> */}
      {/* <RippleGrid/> */}

      {/* <hr/> */}

      {/* <Ending/> */}
      {/* <Test6/> */}
      {/* <Test7/> */}
      <WebCamThumbnail />
        
      <Routes> 
        <Route path = "/" element = { <Test8/> } />
        <Route path = "/ending" element = { <Ending/>}/>
      </Routes>
      
    </div>
  )
}