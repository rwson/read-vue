## 双向绑定实现

在上一篇前面部分贴出了上面的Vue构造器的相关代码,在构造器下面一共调用了5个方法来给```Vue.prototype```添加相关方法,关于第一个已经在前面说过,第二个方法是```stateMixin```,也就是数据绑定的相关方法,一起来看看双向绑定是实现原理:

###### 双向绑定:

```stateMixin```是在```/src/core/instance/state.js```里面实现的



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

initData

```

```



