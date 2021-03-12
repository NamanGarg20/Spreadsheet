//-*- mode: rjsx-mode;

import SingleInput from './single-input.jsx';
import {Spreadsheet} from './spreadsheet.mjs';
import SS from './spreadsheet.jsx';

import React from 'react';
import ReactDom from 'react-dom';


/*************************** App Component ***************************/

const STORE = window.localStorage;

export default class App extends React.Component {

  constructor(props) {
    super(props);

    this.update = this.update.bind(this);

    this.state = {
      ssName: '',
      spreadsheet: null,
    };
  }


  componentDidCatch(error, info) {
    console.error(error, info);
  }


  async update(ssName) {
    if (ssName.match(/^[\w\- ]+$/)) {
      const spreadsheet = await Spreadsheet.make(ssName, this.props.ssClient);
      this.setState({ssName, spreadsheet});
    }
    else {
      throw new Error(`
        Spreadsheet name must contain one-or-more alphanumerics, hyphen or
        space characters.
      `);
    }
  }


  render() {
    const { ssName, spreadsheet } = this.state;
    const ss =
      (spreadsheet) ?  <SS spreadsheet={spreadsheet}/> : '';
    return (
      <div>
        <SingleInput id="ssName" label="Open Spreadsheet Name"
                     value={ssName} update={this.update}/>
        {ss}
     </div>
     );
  }

}
