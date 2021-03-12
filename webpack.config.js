const CopyPlugin = require('copy-webpack-plugin');

const BASE_CONFIG = {
  module: {
    rules: [
      { test: /\.jsx$/,
	exclude: /node_modules/,
	use: [
	  'babel-loader',
	],
      },
      { test: /db-ss-store/,
	loader: 'ignore-loader',
      },
      { test: /persistent-spreadsheet/,
	loader: 'ignore-loader',
      },
      // { test: /\.(png|svg|jpg|gif)$/,
      //   use: [
      //      'file-loader',
      //    ],
      // },      
    ],
    noParse: /db-ss-store|persistent-spreadsheet/,
  },
  plugins: [
    new CopyPlugin({
      patterns: [
	{ from: "src/statics/html/*.html", flatten: true, },
	{ from: "src/statics/styles/*.css", flatten: true, },
    ],
  }),
  ],
};

const DEVEL_CONFIG = {
  devServer: {
    stats: 'errors-only',
    port: process.env.PORT,
    hot: true,
    open: true,
    //open: true,
    overlay: true,
    contentBase: './dist',
  },

  devtool: 'eval-source-map',
};

if (process.env.NODE_ENV === 'production') {
  const TerserPlugin = require("terser-webpack-plugin");
  const PROD_CONFIG = {
    optimization: {
      minimizer: [new TerserPlugin({})],
    },
  };

  module.exports = Object.assign({}, BASE_CONFIG, PROD_CONFIG);
    
}
else {
  module.exports = Object.assign({}, BASE_CONFIG, DEVEL_CONFIG);
}
