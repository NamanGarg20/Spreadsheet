import React  from 'react';
import ReactDom from 'react-dom';

import SSClient from './lib/ss-client.mjs';

import App from './components/app.jsx';

async function root() {
  const ssClient = await SSClient.make();
  const app = <App ssClient={ssClient}/>;
  ReactDom.render(app, document.getElementById('app'));
}

export default root;
