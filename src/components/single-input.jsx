//-*- mode: rjsx-mode;

import React from 'react';
import ReactDom from 'react-dom';

/** Component which displays a single input widget having the following
 *  props:
 *
 *    `id`:     The id associated with the <input> element.
 *    `value`:  An initial value for the widget (defaults to '').
 *    `label`:  The label displayed for the widget.
 *    `update`: A handler called with the `value` of the <input>
 *              widget whenever it is blurred or its containing
 *              form submitted.
 */
export default class SingleInput extends React.Component {

  constructor(props) {
    super(props);

    this.onSubmit = this.onSubmit.bind(this);
    this.onChange = this.onChange.bind(this);

    this.state = {
      error: '',
      value: this.props.value ?? '',
    };
  }

  onChange(ev) {
    const value = ev.target.value;
    this.setState({value, error: '',});
  }

  async onSubmit(ev) {
    ev.preventDefault();
    try {
      const value = this.state.value.trim();
      await this.props.update(value);
      this.setState({error: ''});
    }
    catch (err) {
      this.setState({error: err.message});
    }
  }

  componentDidUpdate(prevProps) {
    if (this.props.id !== prevProps.id) {
      this.setState({error: '', value: this.props.value ?? '', });
    }
  }



  render() {
    const { id, label, } = this.props;
    return (
      <form onSubmit={this.onSubmit}>
        <label htmlFor={id}>{label}</label>
        <span>
          <input name={id} onBlur={this.onSubmit} onChange={this.onChange}
                 value={this.state.value} id={id}/>
          <br/>
          <span className="error">{this.state.error}</span>
        </span>
      </form>
    );
  }

}
