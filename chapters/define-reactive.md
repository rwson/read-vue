## 响应式原理

我们都知道Vue中是基于ES5的`Object.defineProperty`来做的数据响应,本文我们一起来分析下它里面实现原理:



###### initState:

```initState```是在```/src/core/instance/state.js```里面实现的

```javascript
//	vm: Vue组件实例
export function initState (vm: Component) {
  //  被观察的对象列表
  vm._watchers = []
  
  /*  缓存合并过后的$options
  
  	/src/core/instance/init.js
  	vm.$options = mergeOptions(
        resolveConstructorOptions(vm.constructor),
        options || {},
        vm
      )
  */
  const opts = vm.$options
  
  //  组件中传入了props
  if (opts.props) initProps(vm, opts.props)
  
  //  组件中传入了methods
  if (opts.methods) initMethods(vm, opts.methods)
  
  //  组件中传入了data
  if (opts.data) {
    initData(vm)
  } else {
    observe(vm._data = {}, true /* asRootData */)
  }
  
  //  组件中传入了computed
  if (opts.computed) initComputed(vm, opts.computed)
  
  //  组件中传入了watch
  if (opts.watch) initWatch(vm, opts.watch)
}
```



在initState中第一个调用的方法是initProps,我们一起看下initProps相关的

###### initProps:

initProps主要用于处理在组件被实例化时传入的propsData,先来个例子:

```html
//	a.vue
<template>
  <div>
  	<p v-text="msg">
    </p>
  </div>
</template>

<script>
	export default {
       name: "A",
       props: {
         msg: {
           type: String,
           required: true
         }
       }
	}
</script>

//	b.vue
<template>
  <div>
  	<a :msg="msg"></a>
  </div>
</template>

<script>
  	import A from "path/to/a.vue";
	export default {
       name: "B",
       data() {
         return {
           msg: "hello vue"
         }
       },
      components: {
        a: A
      }
	}
</script>


```

在Vue中的prop是单向绑定的,就拿上面的例子来说,如果B组件里面的msg发生改变,是会传给A组件的,但不会反过来,下面一起来看下具体实现:

```javascript
function initProps (vm: Component, propsOptions: Object) {
  //  接收实例化时传入的propsData
  const propsData = vm.$options.propsData || {}
  const props = vm._props = {}

  //  用于缓存propsData的键名数组(Object.keys),
  //  如果后面propsData的属性值有更新,只需遍历数组,无需采用for...in来枚举对象
  const keys = vm.$options._propKeys = []
  
  //  是否为根组件
  const isRoot = !vm.$parent
  
  //  根组件的shouldConvert为true
  observerState.shouldConvert = isRoot
  for (const key in propsOptions) {
    keys.push(key)
    
    //  对当前属性值进行验证,实现在下面进行解析
    const value = validateProp(key, propsOptions, propsData, vm)
    
    if (process.env.NODE_ENV !== 'production') {
      if (isReservedProp[key] || config.isReservedAttr(key)) {
        warn(
          `"${key}" is a reserved attribute and cannot be used as component prop.`,
          vm
        )
      }
      
      //  响应式里面最重要的一个方法,最后进行解释
      defineReactive(props, key, value, () => {
        if (vm.$parent && !observerState.isSettingProps) {
          warn(
            `Avoid mutating a prop directly since the value will be ` +
            `overwritten whenever the parent component re-renders. ` +
            `Instead, use a data or computed property based on the prop's ` +
            `value. Prop being mutated: "${key}"`,
            vm
          )
        }
      })
    } else {
      defineReactive(props, key, value)
    }

    //  当前组件实例中不包含这个key,放到vm._props下面,proxy方法具体实现在下面
    if (!(key in vm)) {
      proxy(vm, `_props`, key)
    }
  }
  observerState.shouldConvert = true
}
```



###### proxy:

从proxy这个方法可以看到,就是调用了一下ES5的```Object.defineProperty```把给对象绑定```getter```和```setter```方法,并没有做特殊处理

```javascript
export function proxy (target: Object, sourceKey: string, key: string) {
  sharedPropertyDefinition.get = function proxyGetter () {
    return this[sourceKey][key]
  }
  sharedPropertyDefinition.set = function proxySetter (val) {
    this[sourceKey][key] = val
  }
  Object.defineProperty(target, key, sharedPropertyDefinition)
}
```



###### validateProp:

该方法主要用于验证传入的props和指定的props类型是否一致

```javascript
//  验证传入的prop和组件中定义的是否一致
//  propOptions: 组件中关于prop的指定
//  propsData: 实际调用时传入的prop
export function validateProp (
  key: string,
  propOptions: Object,
  propsData: Object,
  vm?: Component
): any {

  //  取得组件中定义的prop类型
  const prop = propOptions[key]

  //  判断当前key是否在取得组件中定义的prop类型中声明
  const absent = !hasOwn(propsData, key)

  //  取得外部传入的prop的具体值
  let value = propsData[key]

  //  类型判断,实现在下面
  if (isType(Boolean, prop.type)) {
    if (absent && !hasOwn(prop, 'default')) {
      value = false
    } else if (!isType(String, prop.type) && (value === '' || value === hyphenate(key))) {
      value = true
    }
  }

  //  未传入值,取得默认值,并且对该值进行监视
  if (value === undefined) {
    value = getPropDefaultValue(vm, prop, key)
    const prevShouldConvert = observerState.shouldConvert
    observerState.shouldConvert = true
    observe(value)
    observerState.shouldConvert = prevShouldConvert
  }
  if (process.env.NODE_ENV !== 'production') {
    assertProp(prop, key, value, vm, absent)
  }
  return value
}
```



###### isType:

该方法用来判断组件中指定的prop(具体一个)和实际传入的类型是否相等

```javascript
function isType (type, fn) {
  //  fn非数组,判断函数名称是否相等
  if (!Array.isArray(fn)) {
    return getType(fn) === getType(type)
  }

  //  遍历数组,取得函数名和传入的对比,一真即真
  for (let i = 0, len = fn.length; i < len; i++) {
    if (getType(fn[i]) === getType(type)) {
      return true
    }
  }
  return false
}
```



###### getType:

我们可能都知道如下取得函数名称的一种方式:

```javascript
function func() {}

console.log(func.name);
```

但是这种方式并不是一个标准,从MDN上对[Function.prototype.name](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Function/name)的介绍来看,很多浏览器并不支持这个属性,于是Vue采用了下面这种方法来获取函数名称:

```javascript
function getType (fn) {
  const match = fn && fn.toString().match(/^\s*function (\w+)/)
  //  function func() {}
  //  getType(func)
  //  [ 'function func', 'func', index: 0, input: 'function func() {}' ]
  return match ? match[1] : ''
}
```



initProps大概就这么多了,在initState中调用的第二个函数是initMethods,我们一起看下initMethods相关的代码



###### initMethods:

initMethod的实现比较简单,但是却完成一个非常重要的功能 — 把组件中定义的函数绑定到组件模板中,响应用户输入

```javascript
//  vm: 组件实例
//  methods: 组件中传入的methods
function initMethods (vm: Component, methods: Object) {
  //  取得组件外部传入的属性
  const props = vm.$options.props

  //  对组件中传入的methods进行枚举
  for (const key in methods) {
    //  noop是一个空函数
    //  bind的实现在/src/shared/util.js,稍后分析
    vm[key] = methods[key] == null ? noop : bind(methods[key], vm)
    if (process.env.NODE_ENV !== 'production') {
      if (methods[key] == null) {
        warn(
          `method "${key}" has an undefined value in the component definition. ` +
          `Did you reference the function correctly?`,
          vm
        )
      }

      //  防止prop和methods出现重名
      //  hasOwn => Object.prototype.hasOwnProperty
      if (props && hasOwn(props, key)) {
        warn(
          `method "${key}" has already been defined as a prop.`,
          vm
        )
      }
    }
  }
}
```



###### bind:

这里bind实现一个调用``call``/`apply`来修改函数内this指向、传入相关参数最后把包装后的函数返回的功能,具体实现在`/src/shared/util.js`

```javascript
//	fn: 需要被包装的函数
//  ctx: fn在执行的时候函数内this指向
export function bind (fn: Function, ctx: Object): Function {
  //  包装函数
  function boundFn (a) {
    // 参数个数
    const l: number = arguments.length
    
    //  根据参数个数来判定是调用call或者apply
    return l
      ? l > 1
        ? fn.apply(ctx, arguments)
        : fn.call(ctx, a)
      : fn.call(ctx)
  }
  
  // 包装函数的参数个数
  boundFn._length = fn.length
  return boundFn
}
```

在很多库里面都会封装一个类似的函数,比较直接调用`apply`快,`initMethods`相对比较简单,下面继续看第三个函数— `initData`

###### initData:

initData主要完成对组件中传入的data进行监视的功能

```javascript
//  vm: 组件实例
function initData (vm: Component) {
  let data = vm.$options.data
  //  根据组件中的data类型来获取指定的数据
  data = vm._data = typeof data === 'function'
    ? getData(data, vm)
    : data || {}
  if (!isPlainObject(data)) {
    data = {}
    process.env.NODE_ENV !== 'production' && warn(
      'data functions should return an object:\n' +
      'https://vuejs.org/v2/guide/components.html#data-Must-Be-a-Function',
      vm
    )
  }
  const keys = Object.keys(data)
  const props = vm.$options.props

  //  获取对象所有key的长度
  let i = keys.length

  //  循环遍历
  while (i--) {

    //  判断data中是否和props有重名
    if (props && hasOwn(props, keys[i])) {
      process.env.NODE_ENV !== 'production' && warn(
        `The data property "${keys[i]}" is already declared as a prop. ` +
        `Use prop default value instead.`,
        vm
      )

      //  判断属性名是否为以"_"或者"$"开始,如果不是,对它进行监视
    } else if (!isReserved(keys[i])) {
      proxy(vm, `_data`, keys[i])
    }
  }
  observe(data, true)
}
```



###### initComputed:

initComputed主要完成对组件中传入的computed进行监视的功能

```javascript
const computedWatcherOptions = { lazy: true }

//  vm: 组件实例
//  computed: 组件中传入的computed对象
function initComputed (vm: Component, computed: Object) {
  const watchers = vm._computedWatchers = Object.create(null)

  //  枚举computed对象
  for (const key in computed) {
    const userDef = computed[key]

    //  根据用户指定去拿getter,也就是最后用户取值时执行的函数
    let getter = typeof userDef === 'function' ? userDef : userDef.get
    if (process.env.NODE_ENV !== 'production') {
      if (getter === undefined) {
        warn(
          `No getter function has been defined for computed property "${key}".`,
          vm
        )
        getter = noop
      }
    }

    //  每一个computed的属性都会在vm._computedWatchers中对应一个Watcher实例,Watcher后面分析
    watchers[key] = new Watcher(vm, getter, noop, computedWatcherOptions)

    // 组件原型/data/prop里有和computed出现key同名的情况
    if (!(key in vm)) {
      defineComputed(vm, key, userDef)
    } else if (process.env.NODE_ENV !== 'production') {
      if (key in vm.$data) {
        warn(`The computed property "${key}" is already defined in data.`, vm)
      } else if (vm.$options.props && key in vm.$options.props) {
        warn(`The computed property "${key}" is already defined as a prop.`, vm)
      }
    }
  }
}
```



###### initWatcher:

initWatcher主要处理在组件中传入的watch

```javascript

function initWatch (vm: Component, watch: Object) {
  for (const key in watch) {
    const handler = watch[key]
    if (Array.isArray(handler)) {
      for (let i = 0; i < handler.length; i++) {
        createWatcher(vm, key, handler[i])
      }
    } else {
      createWatcher(vm, key, handler)
    }
  }
}

//  vm: 组件实例
//  key: 属性名
function createWatcher (vm: Component, key: string, handler: any) {
  let options
  //  判断是否为普通对象
  if (isPlainObject(handler)) {
    options = handler
    handler = handler.handler
  }
  if (typeof handler === 'string') {
    handler = vm[handler]
  }
  vm.$watch(key, handler, options)
}
```

好了,`initState`中主要的调用就完了,刚才说到`defineReactive`是完成响应式最主要的一个实现,我们一起看看它的实现(`/src/core/observer/index.js`):



###### defineReactive:

```javascript
export function defineReactive (
  obj: Object,
  key: string,
  val: any,
  customSetter?: Function
) {

  //  创建一个Dep实例
  const dep = new Dep()

  //  Object.getOwnPropertyDescriptor获取对象上的属性描述
  //  https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Object/getOwnPropertyDescriptor
  const property = Object.getOwnPropertyDescriptor(obj, key)

  //  如果当前属性的描述不能被修改,直接return
  if (property && property.configurable === false) {
    return
  }

  // 拿到之前定义好的getter和setter
  const getter = property && property.get
  const setter = property && property.set

  //  observe完成对当前值的监视功能
  let childOb = observe(val)

  //  利用ES5中Object.defineProperty完成数据劫持
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get: function reactiveGetter () {
      //  如果之前指定了getter,直接调用之前定义的
      const value = getter ? getter.call(obj) : val
      if (Dep.target) {
        dep.depend()
        if (childOb) {
          childOb.dep.depend()
        }
        if (Array.isArray(value)) {
          dependArray(value)
        }
      }
      return value
    },
    set: function reactiveSetter (newVal) {
      const value = getter ? getter.call(obj) : val
      //  取得原来的值和新值做比较
      if (newVal === value || (newVal !== newVal && value !== value)) {
        return
      }

      //  如果有自定义的setter,执行自定义的setter
      if (process.env.NODE_ENV !== 'production' && customSetter) {
        customSetter()
      }

      //  调用属性描述的setter方法,对新值进行
      if (setter) {
        setter.call(obj, newVal)
      } else {
        val = newVal
      }

      //  重新观察新值
      childOb = observe(newVal)

      //  当前dep实例下的notify
      dep.notify()
    }
  })
}
```



```javascript
export default class Dep {

  //  静态属性,如果有的话应该是一个Watcher实例
  static target: ?Watcher;

  //  唯一的id
  id: number;

  //  订阅的watchers数组
  subs: Array<Watcher>;

  constructor () {
    this.id = uid++
    this.subs = []
  }

  //  添加一个订阅项
  addSub (sub: Watcher) {
    this.subs.push(sub)
  }

  //  删除一个订阅项
  removeSub (sub: Watcher) {
    remove(this.subs, sub)
  }

  depend () {
    if (Dep.target) {
      Dep.target.addDep(this)
    }
  }

  //  执行每个Watcher实例下的update方法
  notify () {
    const subs = this.subs.slice()
    for (let i = 0, l = subs.length; i < l; i++) {
      subs[i].update()
    }
  }
}

Dep.target = null
```



