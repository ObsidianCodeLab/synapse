# 类型

- [1.1](1.1) <a name="1.1"></a> **基本类型**: 直接存取基本类型。
  **检查方式**： 人工检查

  + `string`
  + `number`
  + `boolean`
  + `null`
  + `undefined`
  + `symbol`

  **正例**

  ```javascript
  const foo = 1;
  let bar = foo;

  bar = 9;

  console.log(foo, bar); // => 1, 9
  ```

- [1.2](1.2) <a name="1.2"></a> **复杂类型**: 通过引用的方式存取复杂类型。
  **检查方式**： 人工检查

  + `object`
  + `array`
  + `function`

  **正例**

  ```javascript
  const foo = {
    a: 1,
    b: 2,
  };
  const bar = foo;

  bar.a = 9;

  console.log(foo.a, bar.a); // => 9, 9
  ```

# 引用

- [2.1](2.1) <a name="2.1"></a> 对所有的引用使用 `const` ；不要使用 `var`。**检查方式**： 工具检查(eslint：[`no-var`](https://eslint.org/docs/latest/rules/no-var))

  > 为什么？这能确保你无法对引用重新赋值，也不会导致出现 bug 或难以理解。

  **<font color=red>反例</font>**

  ```javascript
  var a = 1;
  var b = 2;
  ```

  **正例**

  ```javascript
  const a = 1;
  const b = 2;
  ```

- [2.2](2.2) <a name="2.2"></a> 如果你一定需要可变动的引用，使用 `let` 代替 `var`。`const`声明的变量是不允许修改的。
  **检查方式**： 工具检查(eslint：[`no-const-assign`](https://eslint.org/docs/latest/rules/no-const-assign))

  > 为什么？因为  `let` 是块级作用域，而 `var` 是函数作用域。

  **<font color=red>反例</font>**

  ```javascript
  var count = 1;
  if (true) {
    count += 1;
  }
  ```

  **正例**

  ```javascript
  let count = 1;
  if (true) {
    count += 1;
  }
  ```

  *[说明] use the let.*

- [2.3](2.3) <a name="2.3"></a> `let`和`const`不允许一次声明多个变量/常量，用逗号隔开。
  **检查方式**： 工具检查(eslint：[`one-var`](https://eslint.org/docs/latest/rules/one-var))

  **<font color=red>反例</font>**

  ```javascript
  const bar = 1, baz = 'test';
  let a, b;
  ```

  **正例**

  ```javascript
  const bar = 1;
  const baz = 'test';
  let a;
  let b;
  ```

- [2.4](2.4) <a name="2.4"></a> 注意 `let` 和 `const` 都是块级作用域。
  **检查方式**： 人工检查

  **正例**

  ```javascript
  {
    let a = 1;
    const b = 1;
  }
  console.log(a); // ReferenceError
  console.log(b); // ReferenceError
  ```

  *[说明] const 和 let 只存在于它们被定义的区块内。*

# 对象

- [3.1](3.1) <a name="3.1"></a> 使用字面语法创建对象。
  **检查方式**： 工具检查(eslint：[`no-new-object`](https://eslint.org/docs/latest/rules/no-new-object))

  **<font color=red>反例</font>**

  ```javascript
  const item = new Object();
  ```

  **正例**

  ```javascript
  const item = {};
  ```

- [3.2](3.2) <a name="3.2"></a> 如果你的代码在浏览器环境下执行，别使用 [保留字](http://es5.github.io/#x7.6.1) 作为键值。这样的话在 IE8 不会运行。 [更多信息](https://github.com/airbnb/javascript/issues/61)。 但在 ES6 模块和服务器端中使用没有问题。
  **检查方式**： 人工检查

  **<font color=red>反例</font>**

  ```javascript
  const superman = {
    default: { clark: 'kent' },
    private: true,
  };
  ```

  **正例**

  ```javascript
  const superman = {
    defaults: { clark: 'kent' },
    hidden: true,
  };
  ```

- [3.3](3.3) <a name="3.3"></a> 使用同义词替换需要使用的保留字。
  **检查方式**： 人工检查

  **<font color=red>反例</font>**

  ```javascript
  const superman = {
    class: 'alien',
  };

  const superman = {
    klass: 'alien',
  };
  ```

  **正例**

  ```javascript
  const superman = {
    type: 'alien',
  };
  ```

<a name="es6-computed-properties"></a>

- [3.4](3.4) <a name="3.4"></a> 创建有动态属性名的对象时，使用可被计算的属性名称。
  **检查方式**： 人工检查

  > 为什么？因为这样可以让你在一个地方定义所有的对象属性。

  **<font color=red>反例</font>**

  ```javascript
  function getKey(k) {
    return `a key named ${k}`;
  }

  const obj = {
    id: 5,
    name: 'San Francisco',
  };
  obj[getKey('enabled')] = true;
  ```

  **正例**

  ```javascript
  function getKey(k) {
    return `a key named ${k}`;
  }

  const obj = {
    id: 5,
    name: 'San Francisco',
    [getKey('enabled')]: true,
  };

  ```

- [3.5](3.5) <a name="3.5"></a> 使用对象属性值和方法的简写。
  **检查方式**： 工具检查(eslint：[object-shorthand](https://eslint.org/docs/latest/rules/object-shorthand))

  > 为什么？因为这样更短更有描述性。

  **<font color=red>反例</font>**

  ```javascript
  const lukeSkywalker = 'Luke Skywalker';

  const obj = {
    lukeSkywalker: lukeSkywalker,
    addValue: function (value) {
      return atom.value + value;
    },
  };
  ```

  **正例**

  ```javascript
  const lukeSkywalker = 'Luke Skywalker';

  const obj = {
    lukeSkywalker,
    addValue(value) {
      return atom.value + value;
    },
  };
  ```

- [3.6](3.6) <a name="3.6"></a> 如果对象的键是字符串，请使用长格式语法。
  **检查方式**： 人工检查

  **<font color=red>反例</font>**

  ```javascript
    const foo = {
      'bar-baz'() {},
    };
  ```

  **正例**

  ```javascript
    const foo = {
      'bar-baz': function () {},
    };
  ```

- [3.7](3.7) <a name="3.7"></a> 在对象属性声明前把简写的属性分组。
  **检查方式**： 人工检查

  > 为什么？因为这样能清楚地看出哪些属性使用了简写。

  **<font color=red>反例</font>**

  ```javascript
  const anakinSkywalker = 'Anakin Skywalker';
  const lukeSkywalker = 'Luke Skywalker';

  const obj = {
    episodeOne: 1,
    twoJedisWalkIntoACantina: 2,
    lukeSkywalker,
    episodeThree: 3,
    mayTheFourth: 4,
    anakinSkywalker,
  };
  ```

  **正例**

  ```javascript
  const anakinSkywalker = 'Anakin Skywalker';
  const lukeSkywalker = 'Luke Skywalker';

  const obj = {
    lukeSkywalker,
    anakinSkywalker,
    episodeOne: 1,
    twoJedisWalkIntoACantina: 2,
    episodeThree: 3,
    mayTheFourth: 4,
  };
  ```

- [3.8](3.8) <a name="3.8"></a> 不允许在使用对象字面量申明对象时使用相同的键名。
  **检查方式**： 工具检查(eslint：[`no-dupe-keys`](https://eslint.org/docs/latest/rules/no-dupe-keys))

  **<font color=red>反例</font>**

  ```javascript
  const foo = {
    bar: 'baz',
    bar: 'qux',
  };
  ```

  **正例**

  ```javascript
  const foo = {
    bar: 'baz',
    quxx: 'qux',
  };
  ```

- [3.9](3.9) <a name="3.9"></a> 禁止将全局对象（Math和JSON)作为函数调用。
  **检查方式**： 工具检查(eslint：[`no-obj-calls`](https://eslint.org/docs/latest/rules/no-obj-calls))

  **<font color=red>反例</font>**

  ```javascript
  const math = Math();
  const json = JSON();
  const reflect = Reflect();
  ```

  **正例**

  ```javascript
  function area(r) {
      return Math.PI * r * r;
  }
  const object = JSON.parse("{}");
  const value = Reflect.get({ x: 1, y: 2 }, "x");
  ```

- [3.10](3.10) <a name="3.10"></a> 禁止在对象中使用不必要的计算属性。
  **检查方式**： 工具检查(eslint：[`no-useless-computed-key`](https://eslint.org/docs/latest/rules/no-useless-computed-key))

  **<font color=red>反例</font>**

  ```javascript
  const a = { ['0']: 0 };
  const a = { ['0+1,234']: 0 };
  const a = { [0]: 0 };
  const a = { ['x']: 0 };
  const a = { ['x']() {} };
  ```

  **正例**

  ```javascript
  const c = { a: 0 };
  const c = { 0: 0 };
  const a = { x() {} };
  const c = { a: 0 };
  const c = { '0+1,234': 0 };
  ```

- [3.11](3.11) <a name="3.11"></a> 只允许引号标注无效标识符的属性。
  **检查方式**： 工具检查(eslint：[`no-useless-computed-key`](https://eslint.org/docs/latest/rules/no-useless-computed-key))

  **<font color=red>反例</font>**

  ```javascript
  const bad = {
    'foo': 3,
    'bar': 4,
    'data-blah': 5,
  };
  ```

  **正例**

  ```javascript
  const good = {
    foo: 3,
    bar: 4,
    'data-blah': 5,
  };
  ```

# 数组

- [4.1](4.1) <a name="4.1"></a> 使用字面值创建数组。禁止使用new创建包装实例，如 new String、new Number，这样会变成初始化一个对象，而不是对应的初始类型。
  **检查方式**： 工具检查(eslint：[`no-new-wrappers`](https://eslint.org/docs/latest/rules/no-new-wrappers) [`no-array-constructor`](https://eslint.org/docs/latest/rules/no-new-wrappers))

  **<font color=red>反例</font>**

  ```javascript
  const items = new Array();
  ```

  **正例**

  ```javascript
  const items = [];
  ```

- [4.2](4.2) <a name="4.2"></a> 向数组添加元素时使用 Arrary#push 替代直接赋值。
  **检查方式**： 人工检查

  **<font color=red>反例</font>**

  ```javascript
  const someStack = [];

  someStack[someStack.length] = 'abracadabra';
  ```

  **正例**

  ```javascript
  const someStack = [];

  someStack.push('abracadabra');
  ```

<a name="es6-array-spreads"></a>

- [4.3](4.3) <a name="4.3"></a> 使用数组展开方法`...`来拷贝数组。
  **检查方式**： 人工检查

  **<font color=red>反例</font>**

  ```javascript
  const len = items.length;
  const itemsCopy = [];
  let i;

  for (let i = 0; i < len; i += 1) {
    itemsCopy[i] = items[i];
  }
  ```

  **正例**

  ```javascript
  const itemsCopy = [...items];
  ```

- [4.4](4.4) <a name="4.4"></a> 将一个类数组对象转换成一个数组， 使用展开方法`...`代替`Array.from`。
  **检查方式**： 人工检查

  **正例 good**

  ```javascript
  const foo = document.querySelectorAll('.foo');

  const nodes = Array.from(foo);
  ```

  **正例 best**

  ```javascript
  const foo = document.querySelectorAll('.foo');

  const nodes = [...foo];
  ```

- [4.5](4.5) <a name="4.5"></a> 在数组回调方法中使用 return 语句。 如果函数体由一个返回无副作用的表达式的单个语句组成，那么可以省略返回值, 具体查看[8.3](8.3)
  **检查方式**： 人工检查

  **<font color=red>反例</font>**

  ```javascript
  [[0, 1], [2, 3], [4, 5]].reduce((acc, item, index) => {
    const flatten = acc.concat(item);
    acc[index] = flatten;
  });

  inbox.filter( msg => {
    const { subject, author } = msg;
    if (subject === 'Mockingbird') {
      return author === 'Harper Lee';
    } else {
      return false;
    }
  });
  ```

  *[说明] 没有返回值，意味着在第一次迭代后 `acc` 没有被定义。*

  **正例**

  ```javascript
  inbox.filter( msg => {
    const { subject, author } = msg;
    if (subject === 'Mockingbird') {
      return author === 'Harper Lee';
    }

    return false;
  });

  [1, 2, 3].map(x => x + 1);
  ```

# 解构

- [5.1](5.1) <a name="5.1"></a> 在访问和使用对象的多个属性的时候使用对象的解构。
  **检查方式**： 工具检查(eslint：[`prefer-destructuring`](https://eslint.org/docs/latest/rules/prefer-destructuring))

  > 为什么？解构可以避免为这些属性创建临时引用。

  **<font color=red>反例</font>**

  ```javascript
  function getFullName(user) {
    const firstName = user.firstName;
    const lastName = user.lastName;

    return `${firstName} ${lastName}`;
  }
  ```

  **正例 good**

  ```javascript
  function getFullName(obj) {
    const { firstName, lastName } = obj;
    return `${firstName} ${lastName}`;
  }
  ```

  **正例 best**

  ```javascript
  function getFullName({ firstName, lastName }) {
    return `${firstName} ${lastName}`;
  }
  ```

- [5.2](5.2) <a name="5.2"></a> 对数组使用解构赋值。
  **检查方式**： 工具检查(eslint：[`prefer-destructuring`](https://eslint.org/docs/latest/rules/prefer-destructuring))

  **<font color=red>反例</font>**

  ```javascript
  const arr = [1, 2, 3, 4];

  const first = arr[0];
  const second = arr[1];
  ```

  **正例**

  ```javascript
  const arr = [1, 2, 3, 4];

  const [first, second] = arr; // first = 1  second = 2
  const [, first, second] = arr;
  ```

- [5.3](5.3) <a name="5.3"></a> 对于多个返回值使用对象解构，而不是数组解构。
  **检查方式**： 人工检查

  > 为什么？你可以随时添加新的属性或者改变属性的顺序，而不用修改调用方。

  **<font color=red>反例</font>**

  ```javascript
  function processInput(input) {
    // then a miracle occurs
    return [left, right, top, bottom];
  }

  const [left, __, top] = processInput(input);
  ```

  *[说明] 调用时需要考虑回调数据的顺序。*

  **正例**

  ```javascript
  function processInput(input) {
    // then a miracle occurs
    return { left, right, top, bottom };
  }

  const { left, right } = processInput(input);
  ```

  *[说明] 调用时只选择需要的数据。*

# 字符串

- [6.1](6.1) <a name="6.1"></a> 静态字符串一律使用单引号 `''` 。（如果不是引号嵌套，不要使用双引号）
  **检查方式**： 工具检查(eslint：[`quotes`](https://eslint.org/docs/latest/rules/quotes))

  **<font color=red>反例</font>**

  ```javascript
  const name = "Capt. Janeway";

  const name = `Capt. Janeway`;
  ```

  *[说明] 模板文字应该包含插值或换行。*

  **正例**

  ```javascript
  const name = 'Capt. Janeway';
  ```

- [6.2](6.2) <a name="6.2"></a> 使行超过100个字符的字符串不应使用字符串连接跨多行写入。
  **检查方式**： 人工检查

  > 注：过度使用字串连接符号可能会对性能造成影响。[jsPerf](http://jsperf.com/ya-string-concat) 和 [讨论](https://github.com/airbnb/javascript/issues/40).

  **<font color=red>反例</font>**

  ```javascript
  const errorMessage = 'This is a super long error that was thrown because \
  of Batman. When you stop to think about how Batman had anything to do \
  with this, you would get nowhere \
  fast.';
  ```

  **正例**

  ```javascript
  const errorMessage = 'This is a super long error that was thrown because ' +
    'of Batman. When you stop to think about how Batman had anything to do ' +
    'with this, you would get nowhere fast.';
  const errorMessage = 'This is a super long error that was thrown because of Batman. When you stop to think about how Batman had anything to do with this, you would get nowhere fast.';
  ```

<a name="es6-template-literals"></a>

- [6.3](6.3) <a name="6.3"></a> 建议使用模板。
  **检查方式**： 工具检查(eslint：[prefer-template](https://eslint.org/docs/latest/rules/prefer-template))

  > 为什么？字符串模板为您提供了一种可读的、简洁的语法，具有正确的换行和字符串插值特性。

  **<font color=red>反例</font>**

  ```javascript
  function sayHi(name) {
    return 'How are you, ' + name + '?';
  }

  function sayHi(name) {
    return ['How are you, ', name, '?'].join();
  }
  ```

  **正例**

  ```javascript
  function sayHi(name) {
    return `How are you, ${name}?`;
  }
  ```

- [6.4](6.4) <a name="6.4"></a> 模板字符串中的嵌入表达式两端不要存在空格。
  **检查方式**： 工具检查(eslint：[prefer-template](https://eslint.org/docs/latest/rules/prefer-template))

  **<font color=red>反例</font>**

  ```javascript
  `hello, ${ name}!`;
  `hello, ${name }!`;
  `hello, ${ name }!`;
  ```

  **正例**

  ```javascript
  `hello, ${name}!`;
  `hello, ${
      name
  }!`;
  ```

- [6.5](6.5) <a name="6.5"></a> 不要在转义字符串中不必要的字符:
  **检查方式**： 工具检查(eslint：[no-useless-escape](https://eslint.org/docs/latest/rules/no-useless-escape))

  > 为什么？反斜杠损害了可读性，因此只有在必要的时候才会出现。

  **<font color=red>反例</font>**

  ```javascript
  const foo = '\'this\' \i\s \"quoted\"';
  ```

  **正例**

  ```javascript
  const foo = '\'this\' is "quoted"';
  const foo = `my name is '${name}'`;
  ```

# 函数

- [7.1](7.1) <a name="7.1"></a> 使用函数声明代替函数表达式。
  **检查方式**： 人工检查

  > 为什么？因为函数声明是可命名的，所以他们在调用栈中更容易被识别。此外，函数声明会把整个函数提升（hoisted），而函数表达式只会把函数的引用变量名提升。这条规则使得[箭头函数](#arrow-functions)可以取代函数表达式。

  **<font color=red>反例</font>**

  ```javascript
  const foo = function () {
  };
  ```

  **正例 good**

  ```javascript
  const short = function test() {
    // ...
  };
  const foo = () => {};
  ```

  **正例 best**

  ```javascript
  function foo() {
  }
  ```

- [7.2](7.2) <a name="7.2"></a> 函数表达式:
  **检查方式**： 人工检查

  **正例**

  ```javascript
  (() => {
    console.log('Welcome to the Internet. Please follow me.');
  })();
  ```

  *[说明] 立即调用的函数表达式 (IIFE)。*

- [7.3](7.3) <a name="7.3"></a> 永远不要在一个非函数代码块（`if`、`while` 等）中声明一个函数，把那个函数赋给一个变量。浏览器允许你这么做，但它们的解析表现不一致。
  **检查方式**： 工具检查(eslint：[`no-inner-declarations`](https://eslint.org/docs/latest/rules/no-inner-declarations))

- [7.4](7.4) <a name="7.4"></a> **注意:** ECMA-262 把 `block` 定义为一组语句。函数声明不是语句。[阅读 ECMA-262 关于这个问题的说明](http://www.ecma-international.org/publications/files/ECMA-ST/Ecma-262.pdf#page=97)。
  **检查方式**： 人工检查

  **<font color=red>反例</font>**

  ```javascript
  if (currentUser) {
    function test() {
      console.log('Nope.');
    }
  }
  ```

  **正例**

  ```javascript
  let test;
  if (currentUser) {
    test = () => {
      console.log('Yup.');
    };
  }
  ```

- [7.5](7.5) <a name="7.5"></a> 永远不要把参数命名为 `arguments`。这将取代原来函数作用域内的 `arguments` 对象。
  **检查方式**： 工具检查(eslint：[`no-shadow-restricted-names`](https://eslint.org/docs/latest/rules/no-shadow-restricted-names))

  > 为什么？`arguments`对象是所有(非箭头)函数中都可用的局部变量，不可当做参数。

  **<font color=red>反例</font>**

  ```javascript
  function nope(name, options, arguments) {
    // ...stuff...
  }
  ```

  **正例**

  ```javascript
  function yup(name, options, args) {
    // ...stuff...
  }
  ```

<a name="es6-rest"></a>

- [7.6](7.6) <a name="7.6"></a> 不要使用 `arguments`。可以选择 rest 语法 `...` 替代。
  **检查方式**： 工具检查(eslint：[`prefer-rest-params`](https://eslint.org/docs/latest/rules/prefer-rest-params))

  > 为什么？使用 `...` 能明确你要传入的参数。另外 rest 参数是一个真正的数组，而 `arguments` 是一个类数组。

  **<font color=red>反例</font>**

  ```javascript
  function concatenateAll() {
    const args = Array.prototype.slice.call(arguments);
    return args.join('');
  }
  ```

  **正例**

  ```javascript
  function concatenateAll(...args) {
    return args.join('');
  }
  ```

<a name="es6-default-parameters"></a>

- [7.7](7.7) <a name="7.7"></a> 使用默认的参数语法，而不是改变函数参数。
  **检查方式**： 工具检查(eslint：[`no-param-reassign`](https://eslint.org/docs/latest/rules/no-param-reassign))

  **<font color=red>反例</font>**

  ```javascript
  function handleThings(opts) {
    // 不！我们不应该改变函数参数。
    // 更加糟糕: 如果参数 opts 是 false 的话，它就会被设定为一个对象。
    // 但这样的写法会造成一些 Bugs。
    //（译注：例如当 opts 被赋值为空字符串，opts 仍然会被下一行代码设定为一个空对象。）
    opts = opts || {};
    // ...
  }

  function handleThings(opts) {
    if (opts === void 0) {
      opts = {};
    }
    // ...
  }
  ```

  **正例**

  ```javascript
  function handleThings(opts = {}) {
    // ...
  }
  ```

- [7.8](7.8) <a name="7.8"></a> 直接给函数参数赋值时需要避免副作用。
  **检查方式**： 人工检查

  > 为什么？因为这样的写法很容易混淆。

  **<font color=red>反例</font>**

  ```javascript
  var b = 1;

  function count(a = b++) {
    console.log(a);
  }
  count();  // 1
  count();  // 2
  count(3); // 3
  count();  // 3
  ```

- [7.9](7.9) <a name="7.9"></a> 在函数中有分支时，保证所有的return 语句必须指定返回值。
  **检查方式**： 工具检查(eslint：[`consistent-return`](https://eslint.org/docs/latest/rules/consistent-return) [`no-useless-return`](https://eslint.org/docs/latest/rules/consistent-return))

  **<font color=red>反例</font>**

  ```javascript
  function doSomething(condition) {
    if (condition) {
      return true;
    }
    return;
  }

  function doSomething(condition) {
    if (condition) {
      return true;
    }
  }
  ```

  **正例**

  ```javascript
  function doSomething(condition) {
    if (condition) {
      return true;
    }
    return false;
  }

  function Foo() {
    if (!(this instanceof Foo)) {
      return new Foo();
    }

    this.a = 0;
  }
  ```

- [7.10](7.10) <a name="7.10"></a> 数组方法的回调函数中要有 return 语句。以下方法的回调函数必须最终有`return`语句。
  **检查方式**： 工具检查(eslint：[`array-callback-return`](https://eslint.org/docs/latest/rules/array-callback-return))

  - `Array.from`
  - `Array.prototype.every`
  - `Array.prototype.filter`
  - `Array.prototype.find`
  - `Array.prototype.findIndex`
  - `Array.prototype.map`
  - `Array.prototype.reduce`
  - `Array.prototype.reduceRight`
  - `Array.prototype.some`
  - `Array.prototype.sort`

  **<font color=red>反例</font>**

  ```javascript
  const indexMap = myArray.reduce(function(memo, item, index) {
    memo[item] = index;
  }, {});

  const foo = Array.from(nodes, function(node) {
    if (node.tagName === "DIV") {
      return true;
    }
  });

  const bar = foo.filter(function(x) {
    if (x) {
      return true;
    }
    return;
  });
  ```

  **正例**

  ```javascript
  const indexMap = myArray.reduce((memo, item, index) => {
    memo[item] = index;
    return memo;
  }, {});

  const foo = Array.from(nodes, node => {
    if (node.tagName === 'DIV') {
      return true;
    }
    return false;
  });

  const bar = foo.map(node => node.getAttribute('id'));
  ```

- [7.11](7.11) <a name="7.11"></a> 调用无参构造函数时必须带括号。
  **检查方式**： 工具检查(eslint：[`new-parens`](https://eslint.org/docs/latest/rules/new-parens))

  **<font color=red>反例</font>**

  ```javascript
  const person = new Person;
  const person = new (Person);
  ```

  **正例**

  ```javascript
  const person = new Person();
  const person = new (Person)();
  ```

- [7.12](7.12) <a name="7.12"></a> 函数签名中的间距。
  **检查方式**： 工具检查(eslint：[`space-before-function-paren`](https://eslint.org/docs/latest/rules/space-before-function-paren) [`space-before-blocks`](https://eslint.org/docs/latest/rules/space-before-blocks))

  > 为什么？因为一致性很好，在删除或添加名称时不需要添加或删除空格。

  **<font color=red>反例</font>**

  ```javascript
  const f = function(){};
  const g = function (){};
  const h = function() {};
  ```

  **正例**

  ```javascript
  const x = function () {};
  const y = function a() {};
  ```

- [7.13](7.13) <a name="7.13"></a> 不要变异参数和再分配参数。
  **检查方式**： 工具检查(eslint：[`no-param-reassign`](https://eslint.org/docs/latest/rules/no-param-reassign))

  > 为什么？将传入的对象作为参数进行操作可能会在原始调用程序中造成不必要的变量副作用。重新分配参数会导致意外的行为。

  **<font color=red>反例</font>**

  ```javascript
  function f1(obj) {
    obj.key = 1;
  }

  function f1(a) {
    a = 1;
    // ...
  }

  function f2(a) {
    if (!a) { a = 1; }
    // ...
  }
  ```

  **正例**

  ```javascript
  function f3(a) {
    const b = a || 1;
    // ...
  }

  function f4(a = 1) {
    // ...
  }
  ```

- [7.14](7.14) <a name="7.14"></a> `Generator` 函数是 ES6 提供的一种异步编程解决方案.
  **检查方式**： 人工检查

  > 为什么需要`Generator`？为了解决javascript异步回调层层嵌套的问题，`Generator` 函数提供了异步编程解决方案。他有以下几个特征：

  - `function`关键字后面会带一个`*`号;函数体内部会使用`yield`表达式
  - `Generator`函数是分段执行的，`yield`表达式是暂停执行的标记，而`next`方法可以恢复执行

  **正例**

  ```javascript
  function* helloWorldGenerator() {
    yield 'hello';
    yield 'world';
    return 'ending';
  }
  const hw = helloWorldGenerator();

  hw.next();
  // { value: 'hello', done: false }

  hw.next();
  // { value: 'world', done: false }

  hw.next();
  // { value: 'ending', done: true }

  hw.next();
  // { value: undefined, done: true }
  ```

- [7.15](7.15) <a name="7.15"></a> `Generator` 函数内一定要有`yield`。
  **检查方式**： 工具检查(eslint：[`require-yield`](https://eslint.org/docs/latest/rules/require-yield))

  **<font color=red>反例</font>**

  ```javascript
  function* foo() {
    return 10;
  }
  ```

  **正例**

  ```javascript
  function* foo() {
    yield 5;
    return 10;
  }
  ```

# 箭头函数

- [8.1](8.1) <a name="8.1"></a> 当你必须使用函数表达式（或传递一个匿名函数）时，使用箭头函数符号。
  **检查方式**： 人工检查

  > 为什么？因为箭头函数创造了新的一个 `this` 执行环境（注：参考 [Arrow functions - JavaScript | MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/Arrow_functions) 和 [ES6 arrow functions, syntax and lexical scoping](http://toddmotto.com/es6-arrow-functions-syntaxes-and-lexical-scoping/))，通常情况下都能满足你的需求，而且这样的写法更为简洁。

  **<font color=red>反例</font>**

  ```javascript
  [1, 2, 3].map(function (x) {
    const y = x + 1;
    return x * y;
  });
  ```

  **正例 good**

  ```javascript
  [1, 2, 3].map(x => {
    const y = x + 1;
    return x * y;
  });
  ```

  **正例 best**

  ```javascript
  [1, 2, 3].map(x => x * (x + 1));
  ```

- [8.2](8.2) <a name="8.2"></a> 要求使用箭头函数作为回调。
  **检查方式**： 工具检查(eslint：[`prefer-arrow-callback`](https://eslint.org/docs/latest/rules/prefer-arrow-callback))

  > 为什么？箭头函数自动绑定到其周围作用域/上下文，可以替代显式绑定函数表达式

  **正例**

  ```javascript
  [1, 2, 3].reduce((total, n) => {
    return total + n;
  }, 0);
  ```

- [8.3](8.3) <a name="8.3"></a> 如果一个函数适合用一行写出并且只有一个参数，那就把花括号、圆括号和 `return` 都省略掉。如果不是，那就不要省略。
  **检查方式**： 工具检查(eslint：[`arrow-parens`](https://eslint.org/docs/latest/rules/arrow-parens) [`arrow-body-style`](https://eslint.org/docs/latest/rules/arrow-body-style))

  > 为什么？语法糖。多个函数被链接在一起时，提高可读性。

  > 什么时候不？当你打算回传一个对象的时候。

  **正例**

  ```javascript
  [1, 2, 3].map(x => x * x);

  [1, 2, 3].reduce((total, n) => total + n, 0);

  [1, 2, 3].map(x => (
    {
      x: x + 1,
    }
  ));
  ```

# 构造函数

- [9.1](9.1) <a name="9.1"></a> 总是使用 `class`。避免直接操作 `prototype` 。
  **检查方式**： 人工检查

  > 为什么? 因为 `class` 语法更为简洁更易读。ES6的类class只是一个语法糖，完全可以看作构造函数的另一种写法。新的class写法只是让对象原型的写法更加清晰、更像面向对象编程的语法而已。

  **<font color=red>反例</font>**

  ```javascript
  function Queue(contents = []) {
    this._queue = [...contents];
  }
  Queue.prototype.pop = function() {
    const value = this._queue[0];
    this._queue.splice(0, 1);
    return value;
  }
  ```

  **正例**

  ```javascript
  class Queue {
    constructor(contents = []) {
      this._queue = [...contents];
    }

    pop() {
      const value = this._queue[0];
      this._queue.splice(0, 1);
      return value;
    }
  }
  ```

- [9.2](9.2) <a name="9.2"></a> 使用 `extends` 继承。
  **检查方式**： 人工检查

  > 为什么？因为 `extends` 是一个内建的原型继承方法并且可以在不破坏 instanceof 的情况下继承原型功能。这比ES5的通过修改原型链实现继承，要清晰和方便很多

  **<font color=red>反例</font>**

  ```javascript
  const inherits = require('inherits');
  function PeekableQueue(contents) {
    Queue.apply(this, contents);
  }
  inherits(PeekableQueue, Queue);
  PeekableQueue.prototype.peek = function() {
    return this._queue[0];
  }
  ```

  **正例**

  ```javascript
  class PeekableQueue extends Queue {
    peek() {
      return this._queue[0];
    }
  }
  ```

- [9.3](9.3) <a name="9.3"></a> 方法可以返回 `this` 来供其内部方法调用。
  **检查方式**： 人工检查

  **<font color=red>反例</font>**

  ```javascript
  Jedi.prototype.jump = function() {
    this.jumping = true;
    return true;
  };

  Jedi.prototype.setHeight = function(height) {
    this.height = height;
  };

  const luke = new Jedi();
  luke.jump(); // => true
  luke.setHeight(20); // => undefined
  ```

  **正例**

  ```javascript
  class Jedi {
    jump() {
      this.jumping = true;
      return this;
    }

    setHeight(height) {
      this.height = height;
      return this;
    }
  }

  const luke = new Jedi();

  luke.jump()
    .setHeight(20);
  ```

- [9.4](9.4) <a name="9.4"></a> 可以写一个自定义的 `toString()` 方法，但要确保它能正常运行并且不会引起副作用。
  **检查方式**： 人工检查

  **正例**

  ```javascript
  class Jedi {
    constructor(options = {}) {
      this.name = options.name || 'no name';
    }

    getName() {
      return this.name;
    }

    toString() {
      return `Jedi - ${this.getName()}`;
    }
  }
  ```

- [9.5](9.5) <a name="9.5"></a> 构造函数中禁止在`super()`调用之前使用`this`或`super`。
  **检查方式**： 工具检查(eslint：[`no-this-before-super`](https://eslint.org/docs/latest/rules/no-this-before-super))

  **<font color=red>反例</font>**

  ```javascript
  class A extends B {
    constructor() {
      this.foo();
      super();
    }
  }

  class A extends B {
    constructor() {
      super.foo();
      super();
    }
  }
  ```

  **正例**

  ```javascript
  class A {
    constructor() {
      this.a = 0;
    }
  }

  class A extends B {
    constructor() {
      super();
      this.a = 0;
    }
  }
  ```

- [9.6](9.6) <a name="9.6"></a> 如果没有指定类，则类具有默认的构造器。 一个空的构造器或是一个代表父类的函数是没有必要的。
  **检查方式**： 工具检查(eslint：[`no-useless-constructor`](https://eslint.org/docs/latest/rules/no-useless-constructor))

  > 为什么？es6为没有指定构造函数的类提供了默认构造函数。因此，没有必要提供一个空的构造函数或只是简单的调用父类这样的构造函数

  **<font color=red>反例</font>**

  ```javascript
  class Jedi {
    constructor() {}

    getName() {
      return this.name;
    }
  }

  class Rey extends Jedi {
    constructor(...args) {
      super(...args);
    }
  }
  ```

  **正例**

  ```javascript
  class Rey extends Jedi {
    constructor(...args) {
      super(...args);
      this.name = 'Rey';
    }
  }
  ```

- [9.7](9.7) <a name="9.7"></a> 构造函数类成员中不允许出现重复名称。
  **检查方式**： 工具检查(eslint：[`no-dupe-class-members`](https://eslint.org/docs/latest/rules/no-dupe-class-members))

  **<font color=red>反例</font>**

  ```javascript
  class Foo {
    bar() {}
    bar() {}
  }

  class Foo {
    bar() {}
    get bar() {}
  }

  class Foo {
    static bar() {}
    static bar() {}
  }
  ```

  **正例**

  ```javascript
  class Foo {
    bar() {}
    qux() {}
  }

  class Foo {
    get bar() {}
    set bar(value) {}
  }

  class Foo {
    static bar() {}
    bar() {}
  }
  ```

# 模块

- [10.1](10.1) <a name="10.1"></a> 总是使用模组 (`import`/`export`) 而不是其他非标准模块系统。
  **检查方式**： 人工检查

  > 为什么？模块就是未来，让我们开始迈向未来吧。

  **<font color=red>反例</font>**

  ```javascript
  const WhaleCloudStyleGuide = require('./WhaleCloudStyleGuide');
  module.exports = WhaleCloudStyleGuide.es6;
  ```

  **正例 good**

  ```javascript
  import WhaleCloudStyleGuide from './WhaleCloudStyleGuide';
  export default WhaleCloudStyleGuide.es6;
  ```

  **正例 best**

  ```javascript
  import { es6 } from './WhaleCloudStyleGuide';
  export default es6;
  ```

- [10.2](10.2) <a name="10.2"></a> 不要使用通配符导入。
  **检查方式**： 人工检查

  > 为什么？这样能确保你只有一个默认 export。

  **<font color=red>反例</font>**

  ```javascript
  import * as WhaleCloudStyleGuide from './WhaleCloudStyleGuide';
  ```

*[说明] 不报错。*

**正例**

```javascript
import WhaleCloudStyleGuide from './WhaleCloudStyleGuide';
```

- [10.3](10.3) <a name="10.3"></a>不要从 import 中直接 export。
  **检查方式**： 人工检查

  > 为什么？虽然一行代码简洁明了，但让 import 和 export 各司其职让事情能保持一致。

  **<font color=red>反例</font>**

  ```javascript
  export { es6 as default } from './WhaleCloudStyleGuide';
  ```

  **正例**

  ```javascript
  import { es6 } from './WhaleCloudStyleGuide';
  export default es6;
  ```

- [10.4](10.4) <a name="10.4"></a>确保`import`和`export`命名匹配。
  **检查方式**： 工具检查(eslint：[`import/named`](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/named.md))

  **<font color=red>反例</font>**

  ```javascript
  // ./foo.js
  export const foo = "I'm so foo";

  // ./baz.js
  import { notFoo } from './foo'
  ```

  **正例**

  ```javascript
  // ./foo.js
  export const foo = "I'm so foo";

  // ./bar.js
  import { foo } from './foo'
  ```

- [10.5](10.5) <a name="10.5"></a>模块导入顺序优先级注意。并且`import`优先级一定高于`require`。模块导入按照以下顺序：

  - node模块(fs等)
  - 外部模块(lodash等)
  - 全局模块
  - 父目录模块
  - 当前目录模块

  **检查方式**： 工具检查(eslint：[`import/order`](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/order.md))

  **<font color=red>反例</font>**

  ```javascript
  import _ from 'lodash';
  import path from 'path'; // `path` import should occur before import of `lodash`

  // -----

  const _ = require('lodash');
  const path = require('path'); // `path` import should occur before import of `lodash`

  // -----

  const path = require('path');
  import foo from './foo'; // `import` statements must be before `require` statement
  ```

  **正例**

  ```javascript
  import { es6 } from './WhaleCloudStyleGuide';
  export default es6;

  import path from 'path';
  import _ from 'lodash';

  // -----

  const path = require('path');
  const _ = require('lodash');

  // -----

  // Allowed as ̀`babel-register` is not assigned.
  require('babel-register');
  const path = require('path');

  // -----

  // Allowed as `import` must be before `require`
  import foo from './foo';
  const path = require('path');
  ```

- [10.6](10.6) <a name="10.6"></a>如果一个模块仅有一个导出，请加上`export default`。同样的，一个模块内只能出现一个默认导出`export default`。
  **检查方式**： 工具检查(eslint：[`import/prefer-default-export`](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/prefer-default-export.md) [`import/export`](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/export.md))

  **<font color=red>反例</font>**

  ```javascript
  export const foo = 'foo';
  ```

  **正例**

  ```javascript
  // example1
  export const foo = 'foo';
  const bar = 'bar';
  export default 'bar';

  // example2
  export const foo = 'foo';
  export const bar = 'bar';

  // example3
  const foo = 'foo';
  const bar = 'bar';
  export default { foo, bar }

  // example4
  const foo = 'foo';
  export { foo as default }
  ```

- [10.7](10.7) <a name="10.7"></a>禁止使用`default`作为导入变量名，因为会与`export default`冲突发生错误。
  **检查方式**： 工具检查(eslint：[`no-named-default`](https://eslint.org/docs/latest/rules/no-named-default))

  **<font color=red>反例</font>**

  ```javascript
  // foo.js
  export default 'foo';
  export const bar = 'baz';

  import { default as foo } from './foo.js';
  import { default as foo, bar } from './foo.js';
  ```

  **正例**

  ```javascript
  // foo.js
  export default 'foo';
  export const bar = 'baz';

  import foo from './foo.js';
  import foo, { bar } from './foo.js';
  ```

- [10.8](10.8) <a name="10.8"></a>禁止使用绝对路径导入。
  **检查方式**： 工具检查(eslint：[`import/no-absolute-path`](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-absolute-path.md))

  **<font color=red>反例</font>**

  ```javascript
  import f from '/foo';
  import f from '/some/path';

  const f = require('/foo');
  const f = require('/some/path');
  ```

  **正例**

  ```javascript
  import _ from 'lodash';
  import foo from 'foo';
  import foo from './foo';

  const _ = require('lodash');
  const foo = require('foo');
  const foo = require('./foo');
  ```

- [10.9](10.9) <a name="10.9"></a>禁止使用`AMD` `require/define`。
  **检查方式**： 工具检查(eslint：[`import/no-amd`](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-amd.md))

  > 为什么？因为ES6已经具备模块化，不需要再使用`AMD`规范了。

  **<font color=red>反例</font>**

  ```javascript
  define(["a", "b"], function (a, b) { /* ... */ });

  require(["b", "c"], function (b, c) { /* ... */ });
  ```

`

- [10.10](10.10) <a name="10.10"></a>禁止在 `import` 和 `export` 和解构赋值时将引用重命名为相同的名字。
  **检查方式**： 工具检查(eslint：[`no-useless-rename`](https://eslint.org/docs/latest/rules/no-useless-rename))

  **<font color=red>反例</font>**

  ```javascript
  import { foo as foo } from "bar";

  export { foo as foo };
  export { foo as foo } from "bar";

  let { foo: foo } = bar;
  let { 'foo': foo } = bar;
  function foo({ bar: bar }) {}
  ({ foo: foo }) => {}
  ```

  **正例**

  ```javascript
  import * as foo from "foo";
  import { foo } from "bar";
  import { foo as bar } from "baz";

  export { foo };
  export { foo as bar };
  export { foo as bar } from "foo";

  let { foo } = bar;
  let { foo: bar } = baz;
  let { [foo]: foo } = bar;

  function foo({ bar }) {}
  function foo({ bar: baz }) {}

  ({ foo }) => {}
  ({ foo: bar }) => {}
  ```

# 迭代器和生成器

- [11.1](11.1) <a name="11.1"></a> 不要使用 iterators。使用高阶函数例如 `map()` 和 `reduce()` 替代 `for-of`。
  **检查方式**： 人工检查

  > 为什么？这加强了我们不变的规则。处理纯函数的回调值更易读，这比它带来的副作用更重要。
  > 使用`map()`/`every()`/`filter()`/`find()`/`findIndex()`/`reduce()`/`some()`/`...`遍历数组， 和使用`Object.keys()`/`Object.values()`/`Object.entries()`迭代你的对象生成数组。

  **<font color=red>反例</font>**

  ```javascript
  const numbers = [1, 2, 3, 4, 5];

  let sum = 0;
  for (let num of numbers) {
    sum += num;
  }

  sum === 15;
  ```

  **正例**

  ```javascript
  const numbers = [1, 2, 3, 4, 5];

  let sum = 0;
  numbers.forEach((num) => sum += num);
  sum === 15;

  // best (use the functional force)
  const sum = numbers.reduce((total, num) => total + num, 0);
  sum === 15;
  ```

# 属性

- [12.1](12.1) <a name="12.1"></a> 使用 `.` 来访问对象的属性。
  **检查方式**： 工具检查(eslint：[`dot-notation`](https://eslint.org/docs/latest/rules/dot-notation))

  **<font color=red>反例</font>**

  ```javascript
  const luke = {
    jedi: true,
    age: 28,
  };

  const isJedi = luke['jedi'];
  ```

  **正例**

  ```javascript
  const luke = {
    jedi: true,
    age: 28,
  };

  const isJedi = luke.jedi;
  ```

- [12.2](12.2) <a name="12.2"></a> 当通过变量访问属性时使用中括号 `[]`。
  **检查方式**： 人工检查

  **正例**

  ```javascript
  const luke = {
    jedi: true,
    age: 28,
  };

  function getProp(prop) {
    return luke[prop];
  }

  const isJedi = getProp('jedi');
  ```

- [12.3](12.3) <a name="12.3"></a> 规定声明对象的属性时只能一行声明所有的属性或者每行声明一个属性。
  **检查方式**： 工具检查(eslint：[`object-property-newline`](https://eslint.org/docs/latest/rules/object-property-newline))

  **<font color=red>反例</font>**

  ```javascript
  const obj1 = { foo: 'foo', bar: 'bar',
    baz: 'baz',
  };
  ```

  **正例**

  ```javascript
  const obj1 = { foo: 'foo', bar: 'bar', baz: 'baz' };
  const obj2 = {
    foo: 'foo',
    bar: 'bar',
    baz: 'baz',
  };
  ```

- [12.4](12.4) <a name="12.4"></a> 禁止使用`__proto__`属性，`__proto__`属性已从ECMAScript 3.1开始弃用，不应在代码中使用，改用`getPrototypeOf`方法。
  **检查方式**： 工具检查(eslint：[`no-proto`](https://eslint.org/docs/latest/rules/no-proto))

  **<font color=red>反例</font>**

  ```javascript
  const a = obj.__proto__;
  const a = obj['__proto__'];
  ```

  **正例**

  ```javascript
  const a = Object.getPrototypeOf(obj);
  ```

# 变量

- [13.1](13.1) <a name="13.1"></a> 变量的名称采用小驼峰法则，首字母小写，后续单词的首字母大写。变量的属性名不需要遵循该规则。
  **检查方式**： 工具检查(eslint：[`camelcase`](https://eslint.org/docs/latest/rules/camelcase))

  **<font color=red>反例</font>**

  ```javascript
  const Is_Editable = false;
  ```

  **正例**

  ```javascript
  const isEditable = false;
  const obj = {
    my_pref: 1,
    'my-pref': 2,
  };
  ```

- [13.2](13.2) <a name="13.2"></a> 一直使用 `const` 来声明变量，如果不这样做就会产生全局变量。我们需要避免全局命名空间的污染。
  **检查方式**： 工具检查(eslint：[`no-undef`](https://eslint.org/docs/latest/rules/no-undef))

  **<font color=red>反例</font>**

  ```javascript
  superPower = new SuperPower();
  ```

  **正例**

  ```javascript
  const superPower = new SuperPower();
  ```

- [13.3](13.3) <a name="13.3"></a> 使用 `const` 声明常量或者不会再被分配的变量。
  **检查方式**： 工具检查(eslint：[`prefer-const`](https://eslint.org/docs/latest/rules/prefer-const))

  > 为什么？这样更容易添加新的变量声明，而且你不必担心是使用 ; 还是使用 , 或引入标点符号的差别。 你可以通过 debugger 逐步查看每个声明，而不是立即跳过所有声明。

  **<font color=red>反例</font>**

  ```javascript
  const items = getItems(),
      goSportsTeam = true,
      dragonball = 'z';

  // (compare to above, and try to spot the mistake)
  const items = getItems(),
      goSportsTeam = true;
      dragonball = 'z';
  ```

  **正例**

  ```javascript
  const items = getItems();
  const goSportsTeam = true;
  const dragonball = 'z';
  ```

- [13.4](13.4) <a name="13.4"></a> 将所有的 `const` 和 `let` 分组
  **检查方式**： 人工检查

  > 为什么？这在后边如果需要根据前边的赋值变量指定一个变量时很有用。

  **<font color=red>反例</font>**

  ```javascript
  let i, len, dragonball,
      items = getItems(),
      goSportsTeam = true;

  let i;
  const items = getItems();
  let dragonball;
  const goSportsTeam = true;
  let len;
  ```

  **正例**

  ```javascript
  const goSportsTeam = true;
  const items = getItems();
  let dragonball;
  let i;
  let length;
  ```

- [13.5](13.5) <a name="13.5"></a> 在你需要的地方给变量赋值，但请把它们放在一个合理的位置。
  **检查方式**： 人工检查

  > 为什么？`let` 和 `const` 是块级作用域而不是函数作用域。

  **<font color=red>反例</font>**

  ```javascript
  function(hasName) {
    const name = getName();

    if (!hasName) {
      return false;
    }

    this.setFirstName(name);

    return true;
  }
  ```

  *[说明] unnecessary function call。*

  **正例**

  ```javascript
  function() {
    test();
    console.log('doing stuff..');

    //..other stuff..

    const name = getName();

    if (name === 'test') {
      return false;
    }

    return name;
  }

  function(hasName) {
    if (!hasName) {
      return false;
    }

    const name = getName();
    this.setFirstName(name);

    return true;
  }
  ```

- [13.6](13.6) <a name="13.6"></a> 禁止重新声明变量。
  **检查方式**： 工具检查(eslint：[`no-redeclare`](https://eslint.org/docs/latest/rules/no-redeclare))

  **<font color=red>反例</font>**

  ```javascript
  let a = 3;
  let a = 10;
  ```

  **正例**

  ```javascript
  let a = 3;
  a = 10;
  ```

- [13.7](13.7) <a name="13.7"></a> 避免使用不必要的递增和递减 (++, --)。
  **检查方式**： 工具检查(eslint：[`no-plusplus`](https://eslint.org/docs/latest/rules/no-plusplus))

  > 为什么？在`eslint`文档中，一元递增和递减语句以自动分号插入为主题，并且在应用程序中可能会导致默认值的递增或递减。你可以使用`num += 1`这样的语句来改变您的值，而不是使用`num++`或`num ++`。不允许不必要的增量和减量语句也会使您无法预先递增/预递减值，这也会导致程序中的意外行为

  **<font color=red>反例</font>**

  ```javascript
  const array = [1, 2, 3];
  let num = 1;
  num++;
  --num;

  let sum = 0;
  let truthyCount = 0;
  for (let i = 0; i < array.length; i++) {
    let value = array[i];
    sum += value;
    if (value) {
      truthyCount++;
    }
  }
  ```

  **正例**

  ```javascript
  const array = [1, 2, 3];
  let num = 1;
  num += 1;
  num -= 1;

  const sum = array.reduce((a, b) => a + b, 0);
  const truthyCount = array.filter(Boolean).length;
  ```

- [13.8](13.8) <a name="13.8"></a> 禁止声明的变量与外层作用域的变量同名。
  **检查方式**： 工具检查(eslint：[`no-shadow`](https://eslint.org/docs/latest/rules/no-shadow))

  **<font color=red>反例</font>**

  ```javascript
  const a = 3;
  function b() {
      const a = 10;
  }
  ```

  **正例**

  ```javascript
  const a = 3;
  function b() {
      const c = 10;
  }
  ```

- [13.9](13.9) <a name="13.9"></a> 禁止使用没有定义的变量。禁止在变量定义之前使用它们。
  **检查方式**： 工具检查(eslint：[`no-undef`](https://eslint.org/docs/latest/rules/no-undef) eslint: [`no-use-before-define`](https://eslint.org/docs/latest/rules/no-use-before-define))

  **<font color=red>反例</font>**

  ```javascript
  const a = 5;
  b = 10;
  f();
  function f() {}
  ```

  **正例**

  ```javascript
  let a = 5;
  a = 10;
  function f() {}
  f();
  ```

- [13.10](13.10) <a name="13.10"></a> 不允许初始化变量值为 `undefined`。
  **检查方式**： 工具检查(eslint：[`no-undef-init`](https://eslint.org/docs/latest/rules/no-undef-init))

  **<font color=red>反例</font>**

  ```javascript
  let bar = undefined;
  ```

  **正例**

  ```javascript
  let bar;
  const baz = undefined;
  ```

  *[说明] const声明的常量必须要首先赋值。*

- [13.11](13.11) <a name="13.11"></a> 不允许定义了的变量但是在后面的代码中没有被使用到。
  **检查方式**： 工具检查(eslint：[`no-unused-vars`](https://eslint.org/docs/latest/rules/no-unused-vars))

  **<font color=red>反例</font>**

  ```javascript
  function foo(d) {
    const y = 10;
    const z = 0;
    console.log(z);
  }
  ```

  **正例**

  ```javascript
  function foo(d) {
    console.log(d);
  }
  ```

- [13.12](13.12) <a name="13.12"></a> 禁止使用链式赋值的表达式。
  **检查方式**： 工具检查(eslint：[`no-multi-assign`](https://eslint.org/docs/latest/rules/no-multi-assign))

  **<font color=red>反例</font>**

  ```javascript
  const a = b = c = 5;
  const foo = bar = 'baz';
  ```

  **正例**

  ```javascript
  const a = 5;
  const b = 5;
  const c = 5;
  const foo = 'baz';
  const bar = 'baz';
  ```

- [13.13](13.13) <a name="13.13"></a> 把变量的使用限制在其定义的作用域范围内。
  **检查方式**： 工具检查(eslint：[`block-scoped-var`](https://eslint.org/docs/latest/rules/block-scoped-var))

  **<font color=red>反例</font>**

  ```javascript
  function doIf() {
    if (true) {
        var build = true;
    }

    console.log(build);
  }

  function doIfElse() {
      if (true) {
          var build = true;
      } else {
          var build = false;
      }
  }

  function doTryCatch() {
      try {
          var build = 1;
      } catch (e) {
          var f = build;
      }
  }
  ```

  **正例**

  ```javascript
  function doIf() {
  let build;

  if (true) {
      build = true;
  }

  console.log(build);
  }

  function doIfElse() {
      let build;

      if (true) {
          build = true;
      } else {
          build = false;
      }
  }

  function doTryCatch() {
      let build;
      let f;

      try {
          build = 1;
      } catch (e) {
          f = build;
      }
  }
  ```

- [13.14](13.14) <a name="13.14"></a> 禁止修改类声明的变量。
  **检查方式**： 工具检查(eslint：[`no-class-assign`](https://eslint.org/docs/latest/rules/no-class-assign))

  **<font color=red>反例</font>**

  ```javascript
  class Calculator { }
  Calculator = 0;
  ```

# 提升

- [14.1](14.1) <a name="14.1"></a> `var` 声明会被提升至该作用域的顶部，但它们赋值不会提升。`let` 和 `const` 被赋予了一种称为「[暂时性死区（Temporal Dead Zones, TDZ）](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/let#Temporal_dead_zone_and_errors_with_let)」的概念。这对于了解为什么 [type of 不再安全](http://es-discourse.com/t/why-typeof-is-no-longer-safe/15)相当重要。
  **检查方式**： 人工检查

  **<font color=red>反例</font>**

  ```javascript
  // 我们知道这样运行不了
  // （假设 notDefined 不是全局变量）
  function example() {
    console.log(notDefined); // => throws a ReferenceError
  }

  // 由于变量提升的原因，
  // 在引用变量后再声明变量是可以运行的。
  // 注：变量的赋值 `true` 不会被提升。
  function example() {
    console.log(declaredButNotAssigned); // => undefined
    var declaredButNotAssigned = true;
  }

  // 使用 const 和 let
  function example() {
    console.log(declaredButNotAssigned); // => throws a ReferenceError
    console.log(typeof declaredButNotAssigned); // => throws a ReferenceError
    const declaredButNotAssigned = true;
  }
  ```

  **正例**

  ```javascript
  // 编译器会把函数声明提升到作用域的顶层，
  // 这意味着我们的例子可以改写成这样：
  function example() {
    let declaredButNotAssigned;
    console.log(declaredButNotAssigned); // => undefined
    declaredButNotAssigned = true;
  }
  ```

- [14.2](14.2) <a name="14.2"></a> 匿名函数表达式的变量名会被提升，但函数内容并不会。
  **检查方式**： 人工检查

  **<font color=red>反例</font>**

  ```javascript
  function example() {
    console.log(anonymous); // => undefined

    anonymous(); // => TypeError anonymous is not a function

    var anonymous = function() {
      console.log('anonymous function expression');
    };
  }
  ```

- [14.3](14.3) <a name="14.3"></a> 命名的函数表达式的变量名会被提升，但函数名和函数内容并不会。
  **检查方式**： 人工检查

  **<font color=red>反例</font>**

  ```javascript
  function example() {
    console.log(named); // => undefined

    named(); // => TypeError named is not a function

    superPower(); // => ReferenceError superPower is not defined

    const named = function superPower() {
      console.log('Flying');
    };
  }

  // the same is true when the function name
  // is the same as the variable name.
  function example() {
    console.log(named); // => undefined

    named(); // => TypeError named is not a function

    const named = function named() {
      console.log('named');
    }
  }
  ```

- [14.4](14.4) <a name="14.4"></a> 函数声明的名称和函数体都会被提升。
  **检查方式**： 人工检查
  **<font color=red>反例</font>**

  ```javascript
  function example() {
    superPower(); // => Flying

    function superPower() {
      console.log('Flying');
    }
  }
  ```

# 比较运算符和等号

- [15.1](15.1) <a name="15.1"></a> 优先使用 `===` 和 `!==` 而不是 `==` 和 `!=`.
  **检查方式**： 工具检查(eslint：[`eqeqeq`](https://eslint.org/docs/latest/rules/eqeqeq))

- [15.2](15.2) <a name="15.2"></a> 条件表达式例如 `if` 语句通过抽象方法 `ToBoolean` 强制计算它们的表达式并且总是遵守下面的规则：

  + **对象** 被计算为 **true**
  + **Undefined** 被计算为 **false**
  + **Null** 被计算为 **false**
  + **布尔值** 被计算为 **布尔的值**
  + **数字** 如果是 **+0、-0、或 NaN** 被计算为 **false**, 否则为 **true**
  + **字符串** 如果是空字符串 `''` 被计算为 **false**，否则为 **true**

  **检查方式**： 人工检查

  **正例**

  ```javascript
  if ([0]) {
    // true
    // An array is an object, objects evaluate to true
  }
  ```

- [15.3](15.3) <a name="15.3"></a> 对于布尔值使用简写，但是对于字符串和数字进行显式比较。
  **检查方式**： 人工检查
  **<font color=red>反例</font>**

  ```javascript
  if (isValid === true) {
    // ...
  }

  if (name) {
    // ...
  }

  if (collection.length) {
    // ...
  }
  ```

  **正例**

  ```javascript
  if (isValid) {
    // ...
  }

  if (name !== '') {
    // ...
  }

  if (collection.length > 0) {
    // ...
  }
  ```

- [15.4](15.4) <a name="15.4"></a> 对于绝大多数的使用情况下，结果typeof操作是下列字符串常量之一："undefined"，"object"，"boolean"，"number"，"string"，"function"和"symbol"。将typeof运算符的结果与其他字符串文字进行比较通常是代码编写出现错误。
  **检查方式**： 工具检查(eslint：[`valid-typeof`](https://eslint.org/docs/latest/rules/valid-typeof))

  **<font color=red>反例</font>**

  ```javascript
  typeof foo === undefined;
  typeof bar == Object;
  typeof baz === 'strnig';
  typeof qux === 'some invalid type';
  typeof baz === anotherVariable;
  typeof foo == 5;
  ```

  **正例**

  ```javascript
  typeof foo === 'undefined';
  typeof bar == 'object';
  typeof baz === 'string';
  typeof bar === typeof qux;
  ```

- [15.5](15.5) <a name="15.5"></a> 禁止出现与本身作比较的语句。
  **检查方式**： 工具检查(eslint：[`no-self-compare`](https://eslint.org/docs/latest/rules/no-self-compare))

  **<font color=red>反例</font>**

  ```javascript
  let x = 10;
  if (x === x) {
      x = 20;
  }
  ```

  **正例**

  ```javascript
  let x = 10;
  const y = 10;
  if (x === y) {
      x = 20;
  }
  ```

- [15.6](15.6) <a name="15.6"></a> 禁止条件表达式中出现赋值操作符。
  **检查方式**： 工具检查(eslint：[`no-cond-assign`](https://eslint.org/docs/latest/rules/no-cond-assign))

  **<font color=red>反例</font>**

  ```javascript
  let x;
  if (x = 0) {
      const b = 1;
  }

  // Practical example that is similar to an error
  function setHeight(someNode) {
      "use strict";
      do {
          someNode.height = "100px";
      } while (someNode = someNode.parentNode);
  }
  ```

  **正例**

  ```javascript
  const x;
  if (x === 0) {
      const b = 1;
  }
  ```

- [15.7](15.7) <a name="15.7"></a> 禁止对关系运算符的左操作数使用否定运算符。
  **检查方式**： 工具检查(eslint：[`no-unsafe-negation`](https://eslint.org/docs/latest/rules/no-unsafe-negation))

  **<font color=red>反例</font>**

  ```javascript
  if (!key in object) {
      // operator precedence makes it equivalent to (!key) in object
      // and type conversion makes it equivalent to (key ? "false" : "true") in object
  }
  if (!obj instanceof Ctor) {
      // operator precedence makes it equivalent to (!obj) instanceof Ctor
      // and it equivalent to always false since boolean values are not objects.
  }
  ```

  **正例**

  ```javascript
  if (!(key in object)) {
      // key is not in object
  }
  if (!(obj instanceof Ctor)) {
      // obj is not an instance of Ctor
  }
  if(('' + !key) in object) {
      // make operator precedence and type conversion explicit
      // in a rare situation when that is the intended meaning
  }
  ```

- [15.8](15.8) <a name="15.8"></a> 建议使用扩展运算符而非`.apply()`。
  **检查方式**： 工具检查(eslint：[`prefer-spread`](https://eslint.org/docs/latest/rules/prefer-spread))

  **<font color=red>反例</font>**

  ```javascript
  foo.apply(undefined, args);
  foo.apply(null, args);
  obj.foo.apply(obj, args);
  ```

  **正例**

  ```javascript
  foo(...args);
  obj.foo(...args);
  ```

- [15.9](15.9) <a name="15.9"></a> 三目表达式不应该嵌套，通常是单行表达式。
  **检查方式**： 工具检查(eslint：[`no-nested-ternary`](https://eslint.org/docs/latest/rules/no-nested-ternary))

  **<font color=red>反例</font>**

  ```javascript
  const foo = maybe1 > maybe2
    ? "bar"
    : value1 > value2 ? "baz" : null;
  ```

  **正例 good**

  ```javascript
  const maybeNull = value1 > value2 ? 'baz' : null;
  const foo = maybe1 > maybe2
    ? 'bar'
    : maybeNull;
  ```

  *[说明] 分离为两个三目表达式。*

  **正例 best**

  ```javascript
  const maybeNull = value1 > value2 ? 'baz' : null;
  const foo = maybe1 > maybe2 ? 'bar' : maybeNull;
  ```

# 代码块

- [16.1](16.1) <a name="16.1"></a> 使用大括号包裹所有的多行代码块。
  **检查方式**： 工具检查(eslint：[`curly`](https://eslint.org/docs/latest/rules/curly))

  **<font color=red>反例</font>**

  ```javascript
  if (test)
    return false;

  function example() { return false; }
  ```

  **正例**

  ```javascript
  if (test) return false;

  if (test) {
    return false;
  }

  function example() {
    return false;
  }
  ```

- [16.2](16.2) <a name="16.2"></a> 如果通过 `if` 和 `else` 使用多行代码块，把 `else` 放在 `if` 代码块关闭括号的同一行。
  **检查方式**： 工具检查(eslint：[`brace-style`](https://eslint.org/docs/latest/rules/brace-style))

  **<font color=red>反例</font>**

  ```javascript
  if (test) {
    thing1();
    thing2();
  }
  else {
    thing3();
  }
  ```

  **正例**

  ```javascript
  if (test) {
    thing1();
    thing2();
  } else {
    thing3();
  }
  ```

# 注释

- [17.1](17.1) <a name="17.1"></a> 使用 `/** ... */` 作为多行注释。包含描述、指定所有参数和返回值的类型和值。并且多行注释与上一个代码块之间要空一行。
  **检查方式**： 人工检查

  **<font color=red>反例</font>**

  ```javascript
  // make() returns a new element
  // based on the passed in tag name
  //
  // @param {String} tag
  // @return {Element} element
  function make(tag) {

    // ...stuff...

    return element;
  }
  ```

  **正例**

  ```javascript
  /**
   * make() returns a new element
   * based on the passed in tag name
   *
   * @param {String} tag
   * @return {Element} element
   */
  function make(tag) {

    // ...stuff...

    return element;
  }
  ```

- [17.2](17.2) <a name="17.2"></a> 使用 `//` 作为单行注释。在评论对象上面另起一行使用单行注释。在注释前插入空行。
  **检查方式**： 工具检查(eslint：[`lines-around-comment`](https://eslint.org/docs/latest/rules/lines-around-comment))

  **<font color=red>反例</font>**

  ```javascript
  const active = true;  // is current tab

  function getType() {
    console.log('fetching type...');
    // set the default type to 'no type'
    const type = this._type || 'no type';

    return type;
  }
  ```

  *[说明] 注释错误。*

  **正例**

  ```javascript
  // is current tab
  const active = true;

  function getType() {
    console.log('fetching type...');

    // set the default type to 'no type'
    const type = this._type || 'no type';

    return type;
  }
  ```

  *[说明] 注释正确。*

- [17.3](17.3) <a name="17.3"></a> 给注释增加 `FIXME` 或 `TODO` 的前缀可以帮助其他开发者快速了解这是一个需要复查的问题，或是给需要实现的功能提供一个解决方式。这将有别于常见的注释，因为它们是可操作的。使用 `FIXME -- need to figure this out` 或者 `TODO -- need to implement`。eslint：[`no-warning-comments`](https://eslint.org/docs/latest/rules/no-warning-comments)
  **检查方式**： 人工检查

- [17.4](17.4) <a name="17.4"></a> 使用 `// FIXME`: 标注问题。
  **检查方式**： 人工检查

  **正例**

  ```javascript
  class Calculator {
    constructor() {

      // FIXME: shouldn't use a global here
      total = 0;
    }
  }
  ```

- [17.5](17.5) <a name="17.5"></a> 使用 `// TODO`: 标注问题的解决方式。
  **检查方式**： 人工检查

  **正例**

  ```javascript
  class Calculator {
    constructor() {

      // TODO: total should be configurable by an options param
      this.total = 0;
    }
  }
  ```

# 空白

- [18.1](18.1) <a name="18.1"></a> 使用 2 个空格作为缩进。
  **检查方式**： 工具检查(eslint: [`indent`](https://eslint.org/docs/latest/rules/indent))

  **<font color=red>反例</font>**

  ```javascript
  function() {
  ∙∙∙∙const name;
  }

  function() {
  ∙const name;
  }
  ```

  **正例**

  ```javascript
  function() {
  ∙∙const name;
  }
  ```

- [18.2](18.2) <a name="18.2"></a> 禁止剩余和扩展运算符及其表达式之间有空格。
  **检查方式**： 工具检查(eslint: [`rest-spread-spacing`](https://eslint.org/docs/latest/rules/rest-spread-spacing))

  **<font color=red>反例</font>**

  ```javascript
  fn(... args)
  [... arr, 4, 5, 6]
  let [a, b, ... arr] = [1, 2, 3, 4, 5];
  function fn(... args) { console.log(args); }
  let { x, y, ... z } = { x: 1, y: 2, a: 3, b: 4 };
  let n = { x, y, ... z };
  ```

  **正例**

  ```javascript
  fn(...args)
  [...arr, 4, 5, 6]
  let [a, b, ...arr] = [1, 2, 3, 4, 5];
  function fn(...args) { console.log(args); }
  let { x, y, ...z } = { x: 1, y: 2, a: 3, b: 4 };
  let n = { x, y, ...z };
  ```

- [18.3](18.3) <a name="18.3"></a> 避免在正则表达式中使用多个空格。
  **检查方式**： 工具检查(eslint: [`no-regex-spaces`](https://eslint.org/docs/latest/rules/no-regex-spaces))

  **<font color=red>反例</font>**

  ```javascript
  const re = /foo   bar/;
  const re = new RegExp('foo   bar');
  ```

  **正例**

  ```javascript
  const re = /foo {3}bar/;
  const re = new RegExp('foo {3}bar');
  ```

- [18.4](18.4) <a name="18.4"></a> 禁止使用tab键。
  **检查方式**： 工具检查(eslint: [`no-tabs`](https://eslint.org/docs/latest/rules/no-tabs))

# 逗号

- [19.1](19.1) <a name="19.1"></a> 行首逗号：**不需要**。
  **检查方式**： 工具检查(eslint: [`comma-style`](https://eslint.org/docs/latest/rules/comma-style))

  **<font color=red>反例</font>**

  ```javascript
  const story = [
      once
    , upon
    , aTime
  ];

  const hero = {
      firstName: 'Ada'
    , lastName: 'Lovelace'
    , birthYear: 1815
    , superPower: 'computers'
  };
  ```

  **正例**

  ```javascript
  const story = [
    once,
    upon,
    aTime,
  ];

  const hero = {
    firstName: 'Ada',
    lastName: 'Lovelace',
    birthYear: 1815,
    superPower: 'computers',
  };
  ```

- [19.2](19.2) <a name="19.2"></a> 增加结尾的逗号: **需要**。
  **检查方式**： 工具检查(eslint: [`comma-dangle`](https://eslint.org/docs/latest/rules/comma-dangle))

  > 为什么? 这会让 git diffs 更干净。另外，像 babel 这样的转译器会移除结尾多余的逗号，也就是说你不必担心老旧浏览器的尾逗号问题

  **<font color=red>反例</font>**

  ```javascript
  //  git diff without trailing comma
  const hero = {
       firstName: 'Florence',
       lastName: 'Nightingale'
       lastName: 'Nightingale',
       inventorOf: ['coxcomb graph', 'modern nursing']
  }

  const hero = {
    firstName: 'Dana',
    lastName: 'Scully'
  };

  const heroes = [
    'Batman',
    'Superman'
  ];
  ```

  **正例**

  ```javascript
  const hero = {
       firstName: 'Florence',
       lastName: 'Nightingale',
       inventorOf: ['coxcomb chart', 'modern nursing'],
  }

  const hero = {
    firstName: 'Dana',
    lastName: 'Scully',
  };

  const heroes = [
    'Batman',
    'Superman',
  ];
  ```

- [19.3](19.3) <a name="19.3"></a> 避免使用逗号操作符,在for语句的初始化或更新部分或如果表达式序列明确地包含在括号中时可以使用逗号运算符。
  **检查方式**： 工具检查(eslint: [`no-sequences`](https://eslint.org/docs/latest/rules/no-sequences))

  **<font color=red>反例</font>**

  ```javascript
  var testA = 5;
  var testB = 0;
  testA = testB += 5, testA + testB;
  while (testA = next(), testA && testA.length) {}
  ```

  **正例**

  ```javascript
  foo = (doSomething(), val);
  (0, eval)("doSomething();");
  do {} while ((doSomething(), !!test));
  for (i = 0, j = 10; i < j; i++, j--) {}
  ```

- [19.4](19.4) <a name="19.4"></a> 禁止使用多个逗号来声明一个空数组。
  **检查方式**： 工具检查(eslint: [`no-sparse-arrays`](https://eslint.org/docs/latest/rules/no-sparse-arrays))

  **<font color=red>反例</font>**

  ```javascript
  const items = [,];
  const colors = ['red',, 'blue'];
  ```

  **正例**

  ```javascript
  const items = [];
  const colors = ['red', 'blue'];
  ```

# 分号

- [20.1](20.1) <a name="20.1"></a> **使用分号** 不允许省略。
  **检查方式**： 工具检查(eslint: [`semi`](https://eslint.org/docs/latest/rules/semi) [`no-unexpected-multiline`](https://eslint.org/docs/latest/rules/no-unexpected-multiline))

  **<font color=red>反例</font>**

  ```javascript
  (function() {
    const name = 'Skywalker'
    return name
  })()
  ```

  **正例**

  ```javascript
  (() => {
    const name = 'Skywalker';
    return name;
  })();

  // 防止函数在两个 IIFE 合并时被当成一个参数
  ;(() => {
    const name = 'Skywalker';
    return name;
  })();
  ```

- [20.2](20.2) <a name="20.2"></a> 分号一定出现在句末。
  **检查方式**： 工具检查(eslint: [`semi-style`](https://eslint.org/docs/latest/rules/semi-style))

  **<font color=red>反例</font>**

  ```javascript
  foo()
  ;[1, 2, 3].forEach(bar)

  for (
      let i = 0
      ; i < 10
      ; i += 1
  ) {
      foo()
  }
  ```

  **正例**

  ```javascript
  foo();
  [1, 2, 3].forEach(bar);

  for (
      let i = 0;
      i < 10;
      i += 1
  ) {
      foo();
  }
  ```

- [20.3](20.3) <a name="20.3"></a> 不允许使用多余的分号。
  **检查方式**： 工具检查(eslint: [`no-extra-semi`](https://eslint.org/docs/latest/rules/no-extra-semi))

  **<font color=red>反例</font>**

  ```javascript
  const x = 5;;
  function foo() {
      // code
  };
  ```

  **正例**

  ```javascript
  const x = 5;
  const foo = function () {
      // code
  };
  function bar () {
      // code
  }
  ```

  [Read more](http://stackoverflow.com/a/7365214/1712802).

# 类型转换

- [21.1](21.1) <a name="21.1"></a> 在语句开始时执行类型转换。
  **检查方式**： 人工检查

- [21.2](21.2) <a name="21.2"></a> 字符串：
  **检查方式**： 人工检查

  **<font color=red>反例</font>**

  ```javascript
  //  => this.reviewScore = 9;

  const totalScore = new String(this.reviewScore); // typeof totalScore is "object" not "string"

  const totalScore = this.reviewScore + ''; // invokes this.reviewScore.valueOf()

  const totalScore = this.reviewScore.toString(); // isn’t guaranteed to return a string
  ```

  **正例**

  ```javascript
  //  => this.reviewScore = 9;

  const totalScore = String(this.reviewScore);
  ```

- [21.3](21.3) <a name="21.3"></a> 对数字使用 `parseInt` 转换，并带上类型转换的基数。
  **检查方式**： 工具检查(eslint: [`radix`](https://eslint.org/docs/latest/rules/radix))

  **<font color=red>反例</font>**

  ```javascript
  const inputValue = '4';

  const val = new Number(inputValue);

  const val = +inputValue;

  const val = inputValue >> 0;

  const val = parseInt(inputValue);
  ```

  **正例**

  ```javascript
  const inputValue = '4';

  const val = Number(inputValue);

  const val = parseInt(inputValue, 10);
  ```

- [21.4](21.4) <a name="21.4"></a> 禁止使用位操作运算符.
  **检查方式**： 工具检查(eslint: [`no-bitwise`](https://eslint.org/docs/latest/rules/no-bitwise))

  > 当你使用位运算的时候要小心。 数字总是被以 64-bit 值 的形式表示，但是位运算总是返回一个 32-bit 的整数。 对于大于 32 位的整数值，位运算可能会导致意外行为。 最大的 32 位整数是： 2,147,483,647。

  **<font color=red>反例</font>**

  ```javascript
  var test = y | z;
  var test = y & z;
  x |= y;
  x &= y;
  var test = y ^ z;
  var test = ~ z;
  var test = y << z;
  var test = y >> z;
  ```

  **正例**

  ```javascript
  var test = y || z;
  var test = y && z;
  var test = y > z;
  var test = y < z;
  test += y;
  ```

- [21.5](21.5) <a name="21.5"></a> 布尔:
  **检查方式**： 人工检查

  **<font color=red>反例</font>**

  ```javascript
  const age = 0;

  const hasAge = new Boolean(age);
  ```

  **正例**

  ```javascript
  const age = 0;

  const hasAge = Boolean(age);

  const hasAge = !!age;
  ```

# 命名规则

- [22.1](22.1) <a name="22.1"></a> 避免单字母命名。命名应具备描述性。
  **检查方式**： 人工检查

  **<font color=red>反例</font>**

  ```javascript
  // 不报错但不推荐使用
  function q() {
    // ...stuff...
  }
  ```

  **正例**

  ```javascript
  function query() {
    // ..stuff..
  }
  ```

- [22.2](22.2) <a name="22.2"></a> 使用小驼峰式命名对象、函数和实例。
  **检查方式**： 工具检查(eslint: [`camelcase`](https://eslint.org/docs/latest/rules/camelcase))

  **<font color=red>反例</font>**

  ```javascript
  const OBJEcttsssss = {};
  const this_is_my_object = {};
  function c() {}
  ```

  **正例**

  ```javascript
  const thisIsMyObject = {};
  function thisIsMyFunction() {}
  ```

- [22.3](22.3) <a name="22.3"></a> 使用帕斯卡式命名构造函数或类。
  **检查方式**： 人工检查

  **<font color=red>反例</font>**

  ```javascript
  function user(options) {
    this.name = options.name;
  }

  const bad = new user({
    name: 'nope',
  });
  ```

  **正例**

  ```javascript
  class User {
    constructor(options) {
      this.name = options.name;
    }
  }

  const good = new User({
    name: 'yup',
  });
  ```

- [22.4](22.4) <a name="22.4"></a> 别保存 `this` 的引用。使用箭头函数或 Function#bind。
  **检查方式**： 人工检查

  **<font color=red>反例</font>**

  ```javascript
  function foo() {
    const self = this;
    return function() {
      console.log(self);
    };
  }

  function foo() {
    const that = this;
    return function() {
      console.log(that);
    };
  }
  ```

  **正例**

  ```javascript
  function foo() {
    return () => {
      console.log(this);
    };
  }
  ```

- [22.5](22.5) <a name="22.5"></a> 如果你的文件只输出一个类，那你的文件名必须和类名完全保持一致。
  **检查方式**： 人工检查

  **<font color=red>反例</font>**

  ```javascript
  // file contents
  class CheckBox {
    // ...
  }
  export default CheckBox;

  import CheckBox from './checkBox';

  import CheckBox from './check_box';
  ```

  **正例**

  ```javascript
  // file contents
  class CheckBox {
    // ...
  }
  export default CheckBox;

  import CheckBox from './CheckBox';
  ```

- [22.6](22.6) <a name="22.6"></a> 当你导出默认的函数时使用驼峰式命名。你的文件名必须和函数名完全保持一致。
  **检查方式**： 人工检查
  **正例**

  ```javascript
  function makeStyleGuide() {
  }

  export default makeStyleGuide;
  ```

- [22.7](22.7) <a name="22.7"></a> 当你导出单例、函数库、空对象时使用帕斯卡式命名。
  **检查方式**： 人工检查
  **正例**

  ```javascript
  class Singleton {
    constructor() {
      if (Singleton.instance) {
        return Singleton.instance
      }
      Singleton.instance = this
      return this
    }

    someMethod() {
      console.log('I am a method of the Singleton class')
    }
  }
  export default Singleton;
  ```

# 存取器

- [23.1](23.1) <a name="23.1"></a> 对于属性的存取函数不是必须的。
  **检查方式**： 人工检查

- [23.2](23.2) <a name="23.2"></a> 如果你需要存取函数时使用 `getVal()` 和 `setVal('hello')`。
  **检查方式**： 人工检查

  > 不要使用 JavaScript 的 getters/setters 方法，因为它们会导致意外的副作用，并且更加难以测试、维护和推敲。

  **<font color=red>反例</font>**

  ```javascript
  dragon.age();

  dragon.age(25);
  ```

  **正例**

  ```javascript
  dragon.getAge();

  dragon.setAge(25);
  ```

- [23.3](23.3) <a name="23.3"></a> 如果属性是布尔值，使用 `isVal()` 或 `hasVal()`。
  **检查方式**： 人工检查
  **<font color=red>反例</font>**

  ```javascript
  if (!dragon.age()) {
    return false;
  }
  ```

  **正例**

  ```javascript
  if (!dragon.hasAge()) {
    return false;
  }
  ```

- [23.4](23.4) <a name="23.4"></a> 创建 `get()` 和 `set()` 函数是可以的，但要保持一致。
  **检查方式**： 人工检查
  **正例**

  ```javascript
  class Jedi {
    constructor(options = {}) {
      const lightsaber = options.lightsaber || 'blue';
      this.set('lightsaber', lightsaber);
    }

    set(key, val) {
      this[key] = val;
    }

    get(key) {
      return this[key];
    }
  }
  ```

# 安全

- [24.1](24.1) <a name="24.1"></a>不要使用Math.random生成随机数，采用Web Crypto API代替
  Math.random() 函数返回一个浮点数, 伪随机数在范围(0, 1), 其生成的不能提供像密码一样安全的随机数字（黑客可以计算出客户端生成的的随机数）。不要使用它们来处理有关安全的事情。使用Web Crypto API中的crypto.getRandomValues()方法。
  [CWE-330: Use of Insufficiently Random Values](https://cwe.mitre.org/data/definitions/330.html)
  **检查方式**： 人工检查
  **<font color=red>反例</font>**

  ```javascript
    var randomNumber = Math.random();
  ```

  **正例**

  ```javascript
    // 创建一个长度为1的32位无符号整数类型化数组 
    const randomArray = new Uint32Array(1); 
    // 将随机数填充到数组中 
    crypto.getRandomValues(randomArray); 
    // 获取数组中的随机数 
    var randomNumber = randomArray[0];
  ```

- [24.2](24.2) <a name="24.2"></a>在HTTP请求的Header中设置X-CSRF-token安全头字段，防止CSRF漏洞，增强Web应用的安全防护能力。
  **检查方式**： 人工检查

- [24.3](24.3) <a name="24.3"></a> 确保在项目中使用的 JavaScript、CSS 和其他静态资源文件在更新后能够及时被用户的浏览器获取，避免因浏览器缓存旧文件而导致的访问故障。
  **检查方式**： 人工检查

  > 规范来源：严重生产故障3765517

  **正例**

  1. **版本化资源文件**：
  * 所有静态资源文件（如 `.js`、`.css`、图片等）在发布时应采用版本号或哈希值进行命名。例如：
    * `app.v1.0.0.js` 或 `app.abc123.js`
  * 在文件内容发生变化时，更新文件名，以确保浏览器加载最新版本。
  2. **使用查询参数**：
  * 对于静态资源的引用，可以在 URL 中添加版本号作为查询参数。例如：
    * `app.js?v=1.0.0`
  * 每次更新时，修改查询参数的值，以强制浏览器获取新文件。
- [24.4](24.4) <a name="24.4"></a> 强制：所有 HTTP 请求必须设置超时时间，禁止未配置超时的请求，以避免因网络异常、服务端无响应或慢响应导致的前端资源阻塞和用户体验问题。

  **检查方式**：人工检查

  > :warning: 故障警示! 本规范制定源自严重生产故障（单号：2283079 ）。
  > 对http的特性不熟悉，缺乏相应的技术储备

  注意事项：

  1. 超时后应提示用户（如 Toast、Modal）或切换至备用数据源，避免页面“假死”。
  2. 若存在长轮询（Long Polling）或 SSE（Server-Sent Events）等需长连接的场景，需在代码中明确注释原因。
  3. 通过强制要求超时设置，可显著提升前端应用的健壮性和用户体验，避免因不可控的网络或服务端问题导致系统性风险。
- [24.5](24.5) <a name="24.5"></a> 强制：禁止使用 `Date.prototype.toLocaleDateString()`

  **检查方式**：人工检查

  > **兼容性问题**：不同浏览器或环境对 `toLocaleDateString()` 的实现差异较大（如日期分隔符、语言格式），可能导致显示不一致
  > **不可预测性**：依赖用户电脑、浏览器本地化设置（如系统语言），无法保证全局统一的日期格式。

  **<font color=red>反例</font>**

  ```javascript
    const date = new Date();  
    // 输出可能因环境不同而变为 "10/5/2023"、"2023/10/5" 或 "05.10.2023"  
    const stateDate = date.toLocaleDateString();  
  ```

  **正例**
  **使用标准化工具库**

  ```javascript
     const date = new Date();  
     const stateDate = dayjs(date).format('YYYY-MM-DD');
  ```

- [24.6](24.6) <a name="24.6"></a> 强制：对于包含重要信息（如app-signature 数字签名信息等）的前端js文件需要进行混淆加固
  **使用方式**：研发云持续构建混淆加固节点

  > :warning: 故障警示! 本规范制定来源自
  > 产品安全治理-V9系列-数字签名--JS 加固（单号：11109465）安全团队在6月份已经攻破了某项目的数字签名机制，并实现了自动化加载数字签名的方案，证明我们的方案强度还不够，需要进一步加强

  **<font color=red>反例</font>**
  重要信息数字签名暴露
  ![image](uploads/217230/20ad8124-de3b-4ae8-ba2a-381e18a2d4a8/image.png)

  **正例**
  对上面反例中包含重要信息的js文件使用研发云持续构建混淆加固节点
  ![image](uploads/217230/18113dba-e6e4-476e-8c0e-67f2c1a1e239/image.png)
  对上面反例中包含重要信息的js文件使用研发云持续构建混淆加固节点
  ![image](uploads/214708/f1f6d94d-b8db-411c-81ee-6afb4e15e399/image.png)

- [24.7](24.7) <a name="24.7"></a> 强制：前端应用，主要涉及到nginx的基础镜像，需要使用国际业务运营中心-平台技术部提供的基础安全镜像

  > :warning: 故障警示! 本规范制定来源自
  > 严重生产故障3791904 某项目前端应用是通过root启动，局方发现相关的安全隐患

  平台提供的最新基础nginx镜像，已经去除sudo权限

  **正例**
  使用平台维护的最新nginx基础镜像
  地址：[https://docs.iwhalecloud.com/doi/c7dbhw/sitsWyoJ/sitsWyoP](https://docs.iwhalecloud.com/doi/c7dbhw/sitsWyoJ/sitsWyoP)

    ```
    FROM hub-nj.iwhalecloud.com/public/oraclelinux8-nginx1.28:202603.1
    ```

- [24.8](24.8) <a name="24.8"></a> 强制：禁止在前端 js、css、html 文件中包含物理路径信息、数据库连接信息、SQL语句信息、appKey/accessSecret、对象存储 key/secret、用户名密码及其他敏感信息

  **检查方式**：人工检查

  **<font color=red>反例</font>**
  ![image](uploads/214708/f3f013dd-2bf2-4c9b-afda-61f5c2b4398f/image.png)

# ES新特征

- [25.1](25.1) <a name="25.1"></a>使用简洁的可选链（?.）而不是链式逻辑和、否定的逻辑或空对象。
  **检查方式**： 工具检查(eslint: [`prefer-optional-chain`](https://typescript-eslint.io/rules/prefer-optional-chain))(暂未支持)

  **<font color=red>反例</font>**

  ```javascript
    foo && foo.a && foo.a.b && foo.a.b.c;
    foo && foo['a'] && foo['a'].b && foo['a'].b.c;
    foo && foo.a && foo.a.b && foo.a.b.method && foo.a.b.method();

    // With empty objects
    (((foo || {}).a || {}).b || {}).c;


    // With negated `or`s
    !foo || !foo.bar;
    !foo || !foo[bar];
    !foo || !foo.bar || !foo.bar.baz || !foo.bar.baz();
  ```

  **正例**

  ```javascript
    foo?.a?.b?.c;
    foo?.['a']?.b?.c;
    foo?.a?.b?.method?.();

    foo?.a?.b?.c

    !foo?.bar;
    !foo?.[bar];
    !foo?.bar?.baz?.();
  ```

- [25.2](25.2) <a name="25.2"></a>使用空值合并运算符（??）而不是逻辑链强制执行
  **检查方式**： 工具检查(eslint: [`prefer-nullish-coalescing`](https://typescript-eslint.io/rules/prefer-nullish-coalescing/))(暂未支持)

  **<font color=red>反例</font>**

  ```javascript
  foo !== undefined && foo !== null ? foo : 'a string';
  foo === undefined || foo === null ? 'a string' : foo;
  foo == undefined ? 'a string' : foo;
  foo == null ? 'a string' : foo;
  ```

  **正例**

  ```javascript
  foo ?? 'a string';
  foo ?? 'a string';
  foo ?? 'a string';
  foo ?? 'a string';
  ```

- [25.3](25.3) <a name="25.3"></a>`async/await`语法：asnyc异步函数内必须要有 `await` 关键字，以确保异步函数内部有实际的异步操作
  **检查方式**： 工具检查(eslint: [`require-await`](https://eslint.org/docs/latest/rules/require-await))

  **<font color=red>反例</font>**

  ```javascript
    async function foo() {
        doSomething();
    }

    bar(async () => {
        doSomething();
    });
  ```

  **正例**

  ```javascript
    async function foo() {
        await doSomething();
    }

    bar(async () => {
        await doSomething();
    });
  ```

- [25.4](25.4) <a name="25.4"></a>**spread展开运算符(...)**：使用展开运算符(...)，而不是使用 `Object.assign`。 在`es2018`及之后的版本，展开运算法性能优于 `Object.assign`
  **检查方式**： 工具检查(eslint: [`prefer-object-spread`](https://eslint.org/docs/latest/rules/prefer-object-spread))

  **<font color=red>反例</font>**

  ```javascript
    Object.assign({}, foo);

    Object.assign({}, {foo: 'bar'});
  ```

  **正例**

  ```javascript
    ({ ...foo });

    ({ ...baz, foo: 'bar' });

  ```

- [25.5](25.5) <a name="25.5"></a>**Object.hasOwn新方法**：使用`Object.hasOwn`判断对象是否含有属性，而不是使用 `Object.prototype.hasOwnProperty`，  `Object.hasOwn`更简洁
  **检查方式**： 工具检查(eslint: [`prefer-object-has-own`](https://eslint.org/docs/latest/rules/prefer-object-has-own))(暂未支持)

  **<font color=red>反例</font>**

  ```javascript
    Object.prototype.hasOwnProperty.call(obj, "a");

    const hasProperty = Object.prototype.hasOwnProperty.call(object, property);
  ```

  **正例**

  ```javascript
    Object.hasOwn(obj, "a");

    const hasProperty = Object.hasOwn(object, property);
  ```

- [25.6](25.6) <a name="25.6"></a>**数字分隔符**：使用下划线分隔数字，提高大数字的可读性
  **检查方式**： 人工检查

  **<font color=red>反例</font>**

  ```javascript
    const billion = 1000000000; 
    console.log(billion); 
  ```

  **正例**

  ```javascript
    const billion = 1_000_000_000; // 更清晰的十亿表示
    console.log(billion); // 输出: 1000000000
  ```

- [25.7](25.7) <a name="25.7"></a>**Error Cause**：在新建Error时配置cause参数，这样可以帮助我们更好的进行异常处理
  **检查方式**： 人工检查

  **正例**

```javascript
   try {
     await fetch().catch(err => {
       throw new Error('Request failed', { cause: err }); // 自定义错误 message，将错误原因赋给 cause 属性，传递给下一个捕获的地方。
     })
   } catch (e) {
     console.log(e.message);
     console.log(e.cause);
   }
```

- [25.8](25.8) <a name="25.8"></a>**Promise.withResolvers**：Promise.withResolvers() 方法通过返回一个包含新 promise 及其关联的 resolve 和 reject 函数的对象，减少样板代码，减少潜在的作用域问题，使你的异步逻辑更具可读性
  **检查方式**： 人工检查

  **正例**

```javascript
function withTimeout(promise, ms, onAbort) {
  const { promise: out, resolve, reject } = Promise.withResolvers();
  let timer = null;

  timer = setTimeout(() => {
    try {
      onAbort && onAbort();
    } catch (err) {
      console.error("onAbort 执行出错：", err); 
    }
    reject(new Error(`执行超时 ${ms}ms`));
  }, ms);

  // 任务分支：透传原始 promise 的结果到 out，并在无论成功/失败后清理定时器
  promise.then(resolve, reject).finally(() => clearTimeout(timer));

  return out; 
}
```

