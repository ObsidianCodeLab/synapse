# 前言

编码规范对于程序员而言尤为重要，有以下几个原因：

* 一个软件的生命周期中，80%的花费在于维护。

* 几乎没有任何一个软件，在其整个生命周期中，均由最初的开发人员来维护。

* 编码规范可以改善软件的可读性，可以让程序员尽快而彻底地理解新的代码。

* 如果你将源码作为产品发布，就需要确任它是否被很好的打包并且清晰无误，一如你已构建的其它任何产品。

## 适用对象

浩鲸科技 Go 开发人员

## 目的

为了持续、稳定地开发出高质量，健壮的软件系统，为了保证团队中成员的编码质量，特制定本文档。用于规范团队内部开发过程，增加程序的健壮性，便于后续测试及代码维护，最终提高软件产品的生产力。

# 代码规范

## 命名规范

命名是代码规范中很重要的一部分，统一的命名规则有利于提高的代码的可读性，好的命名仅仅通过命名就可以获取到足够多的信息。

Go在命名时以字母a到z或A到Z或下划线开头，后面跟着零或更多的字母、下划线和数字(0到9)。Go不允许在命名时中使用@、$和%等标点符号。Go是一种区分大小写的编程语言。因此，Manpower和manpower是两个不同的命名。

1. 当命名（包括常量、变量、类型、函数名、结构字段等等）以一个大写字母开头，如:Group1，那么使用这种形式的标识符的对象就可以被外部包的代码所使用（客户端程序需要先导入这个包），这被称为导出(像面向对象语言中的public)；

2. 命名如果以小写字母开头，则对包外是不可见的，但是他们在整个包的内部是可见并且可用的（像面向对象语言中的private)；

参考：[Style Guide](https://google.github.io/styleguide/go/guide),[Style Decisions](https://google.github.io/styleguide/go/decisions)

### 包命名

【强制】package的名字应和目录名称保持一致。

【推荐】package的名字一般采取有意义的包名，简短，有意义。

【强制】package的名字不能和标准库的包名冲突。

【强制】package的名字应为小写单词，不要使用下划线或者混合大小写。

**正例**

```go
package main  
package demo  
```

### 文件命名

【推荐】文件名一般采取有意义的文件名，简短，有意义。

【强制】文件名应为小写单词，使用下划线分隔各个单词。

**正例**

```markdown
my_test.go  
```

### 结构体命名

【强制】采用驼峰命名法，首字母根据访问控制大写或者小写。

【推荐】struct申明和初始化格式采用多行。

**正例**

```go
// 多行申明
type User struct{
    Username  string
    Email     string
}
​
// 多行初始化
u := User{
    Username: "astaxie",
    Email:    "astaxie@gmail.com",
}
```

### 接口命名

【强制】采用驼峰命名法，首字母根据访问控制大写或者小写。

【推荐】单个函数的结构名一般以“er”作为后缀，例如Reader , Writer 。

**正例**

```go
type Reader interface {  
    Read(p []byte)(n int ,err error)  
} 
```

### 变量命名

【推荐】若变量类型为bool类型，则名称一般以 Has, Is, Can 或 Allow开头。

【强制】和结构体类似，变量名称应遵循驼峰法，首字母根据访问控制原则大写或者小写。

【推荐】当遇到特有名词时，一般遵循以下规则:

* 如果变量为私有，且特有名词为首个单词，则使用小写，如apiClient

* 其它情况都应当使用该名词原有的写法，如APIClient、repolD、UserlD

**<font color="red">反例</font>**

```go
var exist bool  
var conflict bool  

var api_client string  
var ApiClient string
```

**正例**

```go
var isExist bool  
var hasconflict bool  

var apiClient string  
var APIClient string
```

### 常量命名

【强制】常量均需使用全部大写字母组成，并使用下划线分词。

【强制】如果是枚举类型的常量，则需要先创建相应类型。

**正例**

```go
const APP_VER = "1.0"  

type Scheme string  
const(  
    HTTP Scheme = "http"  
    HTTPS Scheme = "https"  
)
```

### 关键字

【强制】下面的列表显示了Go中的保留字。这些保留字不能用作常量或变量或任何其他标识符名称。

![image](uploads/24257/ca0b5c1b-6a9d-43b6-9fe4-c2ed19be6761/image.png)

## 注释

Go提供C风格的/**/块注释和C++风格的//行注释。

* 单行注释是最常见的注释形式，你可以在任何地方使用以//开头的单行注释

* 多行注释也叫块注释，均已以 /* 开头，并以 */ 结尾，且不可以嵌套使用，多行注释一般用于包的文档描述或注释成块的代码片段

go语言自带的godoc工具可以根据注释生成文档，并自动生成对应的网站(golang.org就是使用godoc工具直接生成的)，注释的质量决定了生成的文档的质量。每个包都应该有一个包注释，在package子句之前有一个块注释。对于多文件包，包注释只需要存在于一个文件中，任何一个都可以。包评论应该介绍包，并提供与整个包相关的信息。它将首先出现在godoc页面上，并应设置下面的详细文档。

参考：[Effective Go](http://golang.google.cn/doc/effective_go.html#commentary),[Uber的编码规范](https://github.com/uber-go/guide)

### 包注释

【强制】每个包都应该有一个包注释，这通常是一个位于package子句之前的块注释或行注释。包如果有多个go文件，只需要出现在一个go文件中（一般是和包同名的文件）即可。包注释应该包含下面基本信息(请严格按照这个顺序，简介，创建人，创建时间）

* 包的基本简介

* 创建者，格式： 创建人：rtx名

* 创建时间，格式：创建时间：yyyyMMdd

**正例**

```go
// util包，包含了项目公用的一些常量，封装了项目中一些共用函数  
// 创建人： test@iwhalecloud.com  
// 创建时间： 20221124  
  
package util  
```

### 结构体（接口）注释

【强制】每个自定义的结构体都应该有注释说明，该注释对结构进行简要介绍，放在结构体定义的前一行，格式为 结构体名，结构体说明。同时结构体内的每个成员变量都要有说明，该说明放在成员变量的后面（注意对齐）

**正例**

```go
// User 用户对象，定义了用户的基础信息  
type User struct {  
   Username // 用户名    
   Email    // 邮箱  
}
```

### 函数（方法）注释

【强制】每个函数，或者方法（结构体或者接口下的函数称为方法）都应该有注释说明，函数的注释应该包括三个方面（严格按此顺序编写）:

* 简要说明，格式说明：以函数名开头，"，"分隔说明部分

* 参数列表：每行一个参数，参数名开头，"，"分隔说明部分

* 返回值：每行一个返回值

**正例**

```go
// NewAttrModel，属性数据层操作类的工厂方法  
// 参数：  
// ctx：上下文信息  
// 返回值：  
// *AttrModel：属性操作类指针  
func NewAttrModel(ctx *common.Context) *AttrModel{  
  
}  
```

### 代码逻辑注释

【推荐】对于一些关键位置的代码逻辑，或者局部较为复杂的逻辑，需要有相应的逻辑说明，方便其他开发者阅读该段代码

**正例**

```go
// 从 Redis 中批量读取属性，对于没有读取到的 id ， 记录到一个数组里面，准备从 DB 中读取  
xxxxx  
xxxxxxx  
xxxxxxx  
```

### 注释风格

【推荐】统一使用中文注释，对于中英文字符之间严格使用空格分隔， 这个不仅仅是中文和英文之间，英文和中文标点之间也都要使用空格分隔

**正例**

```go
// 从 Redis 中批量读取属性，对于没有读取到的 id ， 记录到一个数组里面，准备从 DB 中读取 
```

建议全部使用单行注释，和下一节代码风格中的缩进和折行一样，单行注释不要过长，禁止超过 120 字符

## 代码风格

### 缩进和折行

【强制】缩进直接使用 gofmt 工具格式化即可（gofmt 是使用 tab 缩进的）

【强制】折行方面，一行最长不超过120个字符，超过的请使用换行展示，尽量保持格式优雅

### 语句的结尾

【强制】在Go语言中，不需要像Java那样需要分号结尾，默认一行就是一条数据。但是如果你打算将多个语句写在同一行，则语句之间必须使用分号。

### 括号和空格

【强制】括号和空格方面，也可以直接使用 gofmt 工具格式化（go 会强制左大括号不换行，换行会报语法错误），所有的运算符和操作数之间要留空格。

**<font color="red">反例</font>**

```go
if a>0 // a,>,0之间应该使用空格  
{ // 左大括号不可以换行，会报语法错误  
  
}  
```

**正例**

```go
if a > 0 {  
  
} 
```

**检查方式**  
工具检查

### import 规范

【推荐】import在多行的情况下，goimports会自动帮你格式化，但是我们这里还是需要遵循import的一些规范，如果你在一个文件里面引入了一个package，一般建议采用如下格式：

```go
import (  
"fmt"  
)  
```

【推荐】如果你的包引入了三种类型的包，标准库包，程序内部包，第三方包，则建议采用如下方式进行组织你的包：

```go
import (  
"encoding/json"  
"strings"  
​  
"myproject/models"  
"myproject/controller"  
"myproject/utils"  
​  
"github.com/astaxie/beego"  
"github.com/go-sql-driver/mysql"  
)  
```

应该有顺序的引入包，不同的类型之间采用空格分离，最上面是标准库，中间是项目包，最下面是第三方包。

【强制】另外，在项目中禁止使用相对路径引入包。

**<font color="red">反例</font>**

```go
import "../net"  
```

**正例**

```go
import "github.com/repo/proj/src/net" 
```

**检查方式**  
工具检查

### 错误处理

【强制】错误处理的原则就是不能丢弃任何有返回err的调用，不要使用 _ 丢弃，必须全部处理。接收到错误，要么返回err，或者使用log记录下来

【强制】尽早return：一旦有错误发生，马上返回

【强制】尽量不要使用panic，除非你知道你在做什么

【推荐】错误描述如果是英文必须为小写，不需要标点结尾

【推荐】采用独立的错误流进行处理

**<font color="red">反例</font>**

```go
if err != nil {  
    // error handling  
} else {  
    // normal code  
} 
```

**正例**

```go
if err != nil {  
    // error handling  
    return // or continue, etc.  
} 
```

### 测试

【强制】单元测试文件名命名规范为 example_test.go 。

【强制】测试用例的函数名称必须以 Test 开头，例如：TestExample。

【推荐】尽量避免使用 main 方法测试。

【推荐】每个重要的函数都要首先编写测试用例，测试用例和正规代码一起提交方便进行回归测试。

**检查方式**  
工具检查

# 编程惯例

## 结构体中包含接口指针

【强制】结构体的某个值的类型不能设置为接口的指针。

**说明** ：接口可以包含任何类型的值，但是，将结构体的某个值的类型设置为接口的指针则会出现问题。

**<font color="red">反例</font>**

```go
package main  
type Brace interface{} // 空接口    

type Round struct {  
    // 结构体    
    prev  Brace  // 值 prev 的类型为接口值    
    prev_ *Brace // 值 prev_ 的类型为接口指针  
}
  
type Square struct{} // 空结构体    
func main() {  
    var r Round  
    var s Square  
    r.prev = s   // OK: 这里 ok    
    r.prev_ = &s // ERR: 想要将 s 的指针赋值给 prev_，会报错  
}
```

**检查方式**  
工具检查

【推荐】将接口指针设置为结构体的某个值。

**说明** ：开发者很少需要在结构体中设置某个值的类型为接口的指针，而应该将接口作为值进行传递，类似于上面的 prev，如果你真的需要将接口指针设置为结构体的某个值，也不需要将其类型设置为指针，例如:

**正例**

```go

package main  
type Brace interface{} // 空接口    

type Round struct {  
   // 结构体    
    prev  Brace // 值 prev 的类型为接口值    
    prev_ Brace // 值 prev_ 的类型为接口值  
}  
  
type Square struct{} // 空结构体    
func main() {  
    var r Round  
    var s Square  
    r.prev = s   // OK: 这里 ok    
    r.prev_ = &s // OK: 想要将 s 的指针赋值给 prev_，可以赋值  
}

```

【推荐】使用结构体指针赋值给接口。

**说明** ：而一般情况下，我们对结构体的方法的结构体部分传参，大多数都是结构体的指针()指针方法，此时可以使用结构体指针赋值给接口的方式，例如:

**正例**

```go
package main  
  
type Brace interface {  
    Length()  
}  
  
type Round struct { // 结构体  
}  
  
func (r *Round) Length() {}  
  
func main() {  
    b := []Brace{&Round{}} // OK: *Round 实现了 Brace 接口，而不是 Round  
}
```

## 验证 interface 的合理性

【推荐】使用一个无用的空值，让编译器帮助判断是否实现了接口。

**说明** ：对于接口的实现，在我们编写代码时，可能会因为种种原因没有实现好对应接口，而这个错误只有在真正调用时才会被发现，例如:

**<font color="red">反例</font>**

```go
package main  
type Brace interface {  
    Length()  
}  

type Round struct {  // 结构体  
}  

func (r *Round) Long() {}  

func main() {  
    _ = []Brace{&Round{}} // ERR: 这里会报错，因为 &Round 没有实现 Brace  
}
```

**检查方式**  
工具检查

所以，我们可以在编写时使用一个无用的空值，来让编译器帮助我们判断是否实现了接口，例如:

**正例**

```go
package main  
type Brace interface {  
    Length()  
}  

type Round struct {// 结构体  
}  

var _ Brace = &Round{} // OK: 利用 var 一个无用的值，让编译器检测 &Round 是否实现了 Brace 接口    
func (r *Round) Long() {}  

func (r *Round) Length() {}  

func main() {  
    }
```

## 接收器与接口

【推荐】对于结构体的值来讲，结构体的指针方法与值方法不能一起调用；对于结构体的指针来讲, 可以调用值方法和指针方法；对于接口来讲, 也可以使用指针接收器来实现接口。

对于结构体的值来讲，结构体的指针方法与值方法不能一起调用，例如:

**<font color="red">反例</font>**

```go
package main  
type S struct {  
    data string  
}  

func (s S) Read() string { // 值方法    
    return s.data  
}  

func (s *S) Write(str string) { // 指针方法    
    s.data = str  
}  

func main() {  
    sVals := map[int]S{1: {data: "A"}}  

    // OK: 你只能通过值调用 Read    
    sVals[1].Read()  

    // ERR: 这里会出现问题，因为方法为指针方法    
    sVals[1].Write("test")  
}
```

**检查方式**  
工具检查

而对于结构体的指针来讲，可以调用值方法和指针方法，例如:

**正例**

```go
package main  
type S struct {  
    data string  
}  

func (s S) Read() string { // 值方法    
    return s.data  
}  

func (s *S) Write(str string) { // 指针方法    
    s.data = str  
}  

func main() {  
    sPtrs := map[int]*S{1: {data: "A"}} // 存储结构体的指针    
    // OK: 通过指针既可以调用 Read(值方法)，也可以调用 Write 方法(指针方法)
    sPtrs[1].Read()  
    sPtrs[1].Write("test")  
}
```

同样的道理，对于接口来讲，也可以使用指针接收器来实现接口

**正例**

```go
package main  
type F interface {  
    f()  
}  

type S1 struct{}  

func (s S1) f() {} // 值方法    
type S2 struct{}  

func (s *S2) f() {} // 指针方法    
func main() {  
    s1Val := S1{}  // 结构体值    
    s1Ptr := &S1{} // 结构体指针    
    s2Val := S2{}  // 结构体值    
    s2Ptr := &S2{} // 结构体指针    
    var i F   // 接口    
    i = s1Val // OK: S1的值实现了值方法    
    i = s1Ptr // OK: S1的指针实现了值方法    
    i = s2Ptr // OK: S2的指针实现了指针方法    
    // ERR: 不行，因为S2是指针方法
    i = s2Val  
}
```

## 零值 Mutex 是有效的

【推荐】避免使用 new 来初始化 Mutex。

**说明**：对于sync 的锁包，sync.Mutex和sync.RWMuntex，他的零值也是有效的，不需要通过new关键字来生成指针

**正例**

```go
package main  

import "sync"  

func main() {  
    mu := new(sync.Mutex) // ERR: 生成 Mutex 的指针，多此一举  
    mu.Lock()  

    var mu1 sync.Mutex // OK: Mutex 的零值也可以正常使用，正确的用法  
    mu1.Lock()  
}
```

【推荐】对于导出类型，请使用私有锁。

**说明**：如果将 Mutex 作为结构体中的一部分，那么其应该作为值类型，而不是指针类型。并且，结构体的 Mutex 应该由包内部控制，不要被外部修改，所以不要把 mutex 直接嵌入到结构体中

**<font color="red">反例</font>**

```go
package main  

import "sync"  
type SMap struct {  
    sync.Mutex // 没有 key，在 struct 中视为匿名字段和提升字段，提升字段会导致暴露方法给外部调用者    
    data map[string]string  
}  

func NewSMap() *SMap {  
    return &SMap{  
        // 因为 Mutex 零值直接可以使用，所以初始化时不需要初始化 Mutex    
        data: make(map[string]string),  
    }  
}  

func (m *SMap) Get(k string) string {  
    m.Lock()  
    defer m.Unlock()  

    return m.data[k]  
}
```

**正例**

```go
package main  

import "sync"  
type SMap struct {  
    mu   sync.Mutex // 设置为普通字段，设置为私有的，防止外部调用，只能让模块内部调用    
    data map[string]string  
}  

func NewSMap() *SMap {  
    return &SMap{  
        // 因为 Mutex 零值直接可以使用，所以初始化时不需要初始化 Mutex    
        data: make(map[string]string),  
    }  
}  

func (m *SMap) Get(k string) string {  
    m.mu.Lock()  
    defer m.mu.Unlock()  

    return m.data[k]  
}
```

## 拷贝 Slices 和 Maps

Slices 和 Maps 内部保存的是指向底层数据的指针，因此涉及到他们的复制时，需要特别的注意。

【参考】避免直接将 Slices 作为函数参数和返回值。

**说明**：当 map 和 slice 作为函数参数使用时，如果存储了他们的引用，则外部对他的修改，也会造成内部的数据错乱。

**<font color="red">反例</font>**

```go
package main

import "fmt"
type Driver struct {
    trips []int
}

func (d *Driver) SetTrips(trips []int) {
    // 直接将slice存储进自身  
    d.trips = trips // ERR: 存在外部修改可能  
}

func (d *Driver) GetTrips() []int {
    // 直接返回 slice  
    return d.trips // ERR: 存在外部修改可能  
}

func main() {
    d := Driver{}
    gt := []int{0, 1, 2, 3}
    d.SetTrips(gt)
    fmt.Println(d.GetTrips()) // [0 1 2 3]  
    gt[0] = 5                 // ERR: 在外部修改了 Driver 的数据，这是你想要的吗?  
    fmt.Println(d.GetTrips()) // [5 1 2 3]  
    rgt := d.GetTrips()       // 获取内部的 slice  
    rgt[0] = 6                // ERR: 在外部修改了 Driver 的数据，这是你想要的吗?  
    fmt.Println(d.GetTrips()) // [6 1 2 3]  
}
```

我们可以借用copy函数，进行 copy，防止引用出现。

**正例**

```go
package main  

import "fmt"  

type Driver struct {  
    trips []int  
}  

func (d *Driver) SetTrips(trips []int) {  
    d.trips = make([]int, len(trips)) // 创建长度为参数长度的新切片  
    copy(d.trips, trips) // OK: 使用 copy 复制值而不是直接引用  
}  

func (d *Driver) GetTrips() []int {  
    res := make([]int, len(d.trips)) // 创建长度为参数长度的新切片  
    copy(res, d.trips) // 使用 copy 复制内部值而不是直接返回内部引用  
    return res // OK: 外部修改不会影响内部  
}  

func main() {  
    d := Driver{}  
    gt := []int{0, 1, 2, 3}  
    d.SetTrips(gt)  
    fmt.Println(d.GetTrips()) // [0 1 2 3]  
    gt[0] = 5 // OK: 在外部修改了 Driver 的数据，不影响内部  
    fmt.Println(d.GetTrips()) // [0 1 2 3]  
    rgt := d.GetTrips() // 获取内部的 slice  
    rgt[0] = 6 // OK: 在外部修改了 Driver 的数据，不影响内部  
    fmt.Println(d.GetTrips()) // [0 1 2 3]  
} 
```

【参考】避免直接将 map 作为函数参数和返回值。

同样的，map 也有这个问题。

**<font color="red">反例</font>**

```go
package main  

import "fmt"  

type Driver struct {  
    trips map[string]int  
}  

func (d *Driver) SetTrips(trips map[string]int) {  
    // 直接将 map 存储进自身  
    d.trips = trips // ERR: 存在外部修改可能  
}  

func (d *Driver) GetTrips() map[string]int {  
    // 直接返回 map  
    return d.trips // ERR: 存在外部修改可能  
}  

func main() {  
    d := Driver{}  
    gt := make(map[string]int)  
    gt["0"] = 0  
    gt["1"] = 1  
    d.SetTrips(gt)  
    fmt.Println(d.GetTrips()) // map[0:0 1:1]  
    gt["0"] = 5 // ERR: 在外部修改了 Driver 的数据，这是你想要的吗?  
    fmt.Println(d.GetTrips()) // map[0:5 1:1]  
    rgt := d.GetTrips() // 获取内部的 map  
    rgt["0"] = 6 // ERR: 在外部修改了 Driver 的数据，这是你想要的吗?  
    fmt.Println(d.GetTrips()) // map[0:6 1:1]  
}  
```

对于 map，没有内置的 copy 函数，我们可以手动赋值达到效果。

**正例**

```go
package main  

import "fmt"  

type Driver struct {  
    trips map[string]int  
}  

func (d *Driver) SetTrips(trips map[string]int) {  
    d.trips = make(map[string]int, len(trips)) // make  
    for k, v := range trips { // 使用循环来赋值  
        d.trips[k] = v  
    }  
}  

func (d *Driver) GetTrips() map[string]int {  
    res := make(map[string]int, len(d.trips))  
    for k, v := range d.trips {  
        res[k] = v  
    }  
    return res  
}  

func main() {  
    d := Driver{}  
    gt := make(map[string]int)  
    gt["0"] = 0  
    gt["1"] = 1  
    d.SetTrips(gt)  
    fmt.Println(d.GetTrips()) // map[0:0 1:1]  
    gt["0"] = 5 // OK: 在外部修改了 Driver 的数据，这是你想要的吗?  
    fmt.Println(d.GetTrips()) // map[0:0 1:1]  
    rgt := d.GetTrips() // 获取内部的 map  
    rgt["0"] = 6 // OK: 在外部修改了 Driver 的数据，这是你想要的吗?  
    fmt.Println(d.GetTrips()) // map[0:0 1:1]  
}  
```

## 避免忘记释放资源

【推荐】使用 defer 释放资源。

**说明**：defer 在函数返回之前执行，所以我们可以利用 defer 进行资源的释放。

**<font color="red">反例</font>**

```go
package main  

import "sync"  

func test(count int) int {  
    mu := sync.Mutex{}  
    mu.Lock()  
    count++  
    mu.Unlock() // ERR: 手动关闭，很容易遗忘，且针对多个分支处理，容易遗忘  
    // 当有多个 return 分支时，很容易遗忘 unlock  
    return 1  
}
```

**正例**

```go
package main  

import "sync"  

func test(count int) int {  
    mu := sync.Mutex{}  
    mu.Lock()  
    defer mu.Unlock() // OK: 注册 defer，后续无需操心解锁时机  
    count++  
    return 1  
}  
```

defer 对于程序的开销非常小，只有确定真的对函数的执行时间控制为纳秒单位时，才不使用 defer. 普通情况下，使用 defer 来保持代码整洁性是十分推荐的。

## channel 的 size 设置为无缓冲或者1

【推荐】避免将channel 的 size 设置大于1。

**说明**：channel 的 size 通常是1或者是无缓冲的，默认情况下，channel 应该是无缓冲的，因为 channel 的大小是无法改变的，所以一般我们尽可能的希望其中不要存储数据，只作为传输. 可以设置为 1 做一个最小的冗余，而设置为其他大小时，必须要考虑是什么让你必须选择有其他缓冲长度的通道? 是否可以通过别的方式解决?

**<font color="red">反例</font>**

```go
package main  

func test(count int) {  
    c := make(chan int, 1024) // ERR: 为什么要这样做?  
} 
```

**正例**

```go
package main  

func test(count int) {  
    c := make(chan int, 1) // OK: 只设置1个冗余  
    c1 := make(chan int) // OK: 无缓冲  
}  
```

## 并发处理

【强制】不要在代码中泄漏 goroutine。

**说明**：Goroutines 是轻量级的，但它们不是免费的： 至少，它们会为堆栈和 CPU 的调度消耗内存。 虽然这些成本对于 Goroutines 的使用来说很小，但当它们在没有受控生命周期的情况下大量生成时会导致严重的性能问题。 具有非托管生命周期的 Goroutines 也可能导致其他问题，例如防止未使用的对象被垃圾回收并保留不再使用的资源。

因此，不要在代码中泄漏 goroutine。 使用 [go.uber.org/goleak](https://pkg.go.dev/go.uber.org/goleak) 来测试可能产生 goroutine 的包内的 goroutine 泄漏。

一般来说，每个 goroutine:

* 必须有一个可预测的停止运行时间； 或者
* 必须有一种方法可以向 goroutine 发出信号它应该停止

在这两种情况下，都必须有一种方式代码来阻塞并等待 goroutine 完成。

**<font color="red">反例</font>**

```go
go func() {
  for {
    flush()
    time.Sleep(delay)
  }
}()
```

没有办法阻止这个 goroutine。这将一直运行到应用程序退出。

**正例**

```go
var (
  stop = make(chan struct{}) // 告诉 goroutine 停止
  done = make(chan struct{}) // 告诉我们 goroutine 退出了
)
go func() {
  defer close(done)
  ticker := time.NewTicker(delay)
  defer ticker.Stop()
  for {
    select {
    case <-tick.C:
      flush()
    case <-stop:
      return
    }
  }
}()
// 其它...
close(stop)  // 指示 goroutine 停止
<-done       // and wait for it to exit  
```

这个 goroutine 可以用 `close(stop)`, 我们可以等待它退出 `<-done`

### 等待 goroutines 退出

【强制】必须有一种方案能等待 goroutine 的退出。

**说明**：给定一个由系统生成的 goroutine， 必须有一种方案能等待 goroutine 的退出。 有两种常用的方法可以做到这一点：

* 使用 `sync.WaitGroup`. 如果您要等待多个 goroutine，请执行此操作
  **正例**

```go
var wg sync.WaitGroup
for i := 0; i < N; i++ {
  wg.Add(1)
  go func() {
    defer wg.Done()
    // ...
  }()
}

// To wait for all to finish:
wg.Wait()
```

* 添加另一个 `chan struct{}`，goroutine 完成后会关闭它。 如果只有一个 goroutine，请执行此操作。
  **正例**

```go
done := make(chan struct{})
go func() {
  defer close(done)
  // ...
}()

// To wait for the goroutine to finish:
<-done
```

### 不要在 init() 使用 goroutines

【强制】`init()` 函数不应该产生 goroutines。

**说明**：如果一个包需要一个后台 goroutine， 它必须公开一个负责管理 goroutine 生命周期的对象。 该对象必须提供一个方法（`Close`、`Stop`、`Shutdown` 等）来指示后台 goroutine 停止并等待它的退出。

**<font color="red">反例</font>**

```go
func init() {
  go doWork()
}
func doWork() {
  for {
    // ...
  }
}
```

当用户导出这个包时，无条件地生成一个后台 goroutine。 用户无法控制 goroutine 或停止它的方法。

**正例**

```go
type Worker struct{ /* ... */ }
func NewWorker(...) *Worker {
  w := &Worker{
    stop: make(chan struct{}),
    done: make(chan struct{}),
    // ...
  }
  go w.doWork()
}
func (w *Worker) doWork() {
  defer close(w.done)
  for {
    // ...
    case <-w.stop:
      return
  }
}
// Shutdown 告诉 worker 停止
// 并等待它完成。
func (w *Worker) Shutdown() {
  close(w.stop)
  <-w.done
} 
```

仅当用户请求时才生成工作人员。 提供一种关闭工作器的方法，以便用户可以释放工作器使用的资源。
请注意，如果工作人员管理多个 goroutine，则应使用`WaitGroup`。

## 枚举从 1 开始

【推荐】枚举避免从 0 开始。

**说明**：go 中使用枚举的方式是声明一个自定义的类型和一个iota的const组，因为变量默认值为0，因此枚举的一组通常以0值开始，但是有时候，0 有着特殊的意义，比如 int 的默认值就为0，因此将枚举设置为1开始可以防止可能出现的错误值进行枚举

**<font color="red">反例</font>**

```go
package main  

import "fmt"  

type Operation int // int 类型枚举  

const (  
    Add Operation = iota  
    Subtract  
    Multiply  
)  

// Add=0, Subtract=1, Multiply=2  

func (o Operation) ToString() string {  
    res := ""  
    switch o {  
        case Add:  
        res = "Add"  
        case Subtract:  
        res = "Subtract"  
        case Multiply:  
        res = "Multiply"  
    }  
    return res  
}  

func main() {  
    var o Operation // 默认为0  
    // 这里因为遗漏，没有正确的对 o 进行赋值  
    fmt.Println(o.ToString()) // ERR: 解出来却是 Add，只是因为int 默认为0  
} 
```

**正例**

```go
package main  

import "fmt"  

type Operation int // int 类型枚举  

const (  
    Add Operation = iota + 1  
    Subtract  
    Multiply  
)  

// Add=1, Subtract=2, Multiply=3  

func (o Operation) ToString() string {  
    res := ""  
    switch o {  
        case Add:  
        res = "Add"  
        case Subtract:  
        res = "Subtract"  
        case Multiply:  
        res = "Multiply"  
    }  
    return res  
}  

func main() {  
    var o Operation // 默认为0  
    // 这里因为遗漏，没有正确的对 o 进行赋值  
    fmt.Println(o.ToString()) // OK: 解出来是空，代表错误了，避免了 o 是默认值而错误的找到了枚举  
}  
```

## 避免自己处理时间

时间的处理与计算总是复杂的，在开发者的认知中，可能存在以下错误:

* 一天总有24小时

* 一年总有365天

* 不要试图自己实现时间的计算逻辑，时间的计算实际上是很复杂的，而 golang 内置的 time 包已经提供了很丰富的方法，而且可以保证准确性

【推荐】建议使用time.Time表示某个瞬间时间。

**说明**：使用time.Time类型表示某一刻的时间，在 时间比较/计算 时使用内置的方法

**<font color="red">反例</font>**

```go
// 判断时间是否在某个时间段内  
func isActive(now, start, stop int) bool {  
    return start <= now && now < stop  
}
```

**正例**

```go
// 判断时间是否在某个时间段内  
func isActive(now, start, stop time.Time) bool { // time.Time 类型  
    // start.Before(now) 判断 start 是否在 now 之前  
    // start.Equal(now) 判断 now 是否与 start 相同  
    // now.Before(stop) 判断 now 是否在 stop 之前  
    return (start.Before(now) || start.Equal(now)) && now.Before(stop)  
}  
```

【推荐】建议使用time.Duration表达时间段。

**说明**：使用time.Duration来表达某个时间段，而不是其他数据类型

**<font color="red">反例</font>**

```go
package main  

import "time"  

func poll(delay int) {  
    for {  
        // sleep delay 毫秒  
        time.Sleep(time.Duration(delay) * time.Millisecond)  
    }  
}  

func main() {  
    poll(10) // 调用者只能通过注释和查看源代码来确认参数 delay 代表毫秒还是秒  
}  
```

**正例**

```go
package main  

import "time"  

func poll(delay time.Duration) {  
    for {  
        // ...  
        time.Sleep(delay)  
    }  
}  

func main() {  
    poll(10 * time.Second) // 调用者自己决定 sleep 多久  
}  
```

【推荐】建议使用 time 包方法就行时间加减。

**说明**：时间的加减一定不要自己实现，需要考虑的情况太多了对于日期的加减，我们可以使用 time.Time的AddDate方法，而对于时间的加减，使用Time.Add

**正例**

```go
package main  

import (  
    "fmt"  
    "time"  
)  

func main() {  
    t := time.Now() // 获取当前时间  
    fmt.Println(t)  
    newDay := t.AddDate(0 /* years */, 1 /* months */, 1 /* days */) // +1月+1天  
    fmt.Println(newDay)  
    newDay1 := t.AddDate(0 /* years */, -1 /* months */, 1 /* days */) // -1月+1天  
    fmt.Println(newDay1)  
    maybeNewDay := t.Add(24 * time.Hour) // +24h  
    fmt.Println(maybeNewDay)  
    maybeNewDay1 := t.Add(-24 * time.Second) // -24s  
    fmt.Println(maybeNewDay1)  
} 
```

【推荐】建议在对外部的系统中使用time.Time和time.Duration。

**说明**：尽可能的在与外部系统的交互中使用time.Time和time.Duration, 例如:

* Command-line 标志: flag 通过 time.ParseDuration 支持 time.Duration

* JSON: encoding/json 通过其 UnmarshalJSON method 方法支持将 time.Time 编码为 RFC 3339 字符串

* SQL: database/sql 支持将 DATETIME 或 TIMESTAMP 列转换为 time.Time，如果底层驱动程序支持则返回

* YAML: gopkg.in/yaml.v2 支持将 time.Time 作为 RFC 3339 字符串，并通过 time.ParseDuration 支持 time.Duration对于time.Time，其他语言一般也都会支持解析，因为他是统一的标准，而对于time.Duration，如果不支持，请使用int或者float64，并且在字段名称中包含单位。例如，json不支持time.Duration，因此使用int替代，并且将单位包含在名称中，提高可读性

**<font color="red">反例</font>**

```go
package main  

import (  
    "encoding/json"  
    "log"  
    "time"  
)  

type Task struct {  
    StartTime time.Time `json:"start_time"`  
    Timeout int `json:"timeout"` // 这里是秒还是毫秒?  
}  

func main() {  
    t := Task{  
        StartTime: time.Now(),  
        Timeout: int((time.Second * 30).Seconds()),  
    }  
    s, err := json.Marshal(t)  
    if err != nil {  
        log.Fatalln(err)  
    }  
    log.Println(string(s))  
}  


2022/05/17 17:05:42 {"start_time":"2022-05-17T17:05:42.356961+08:00","timeout":30}  

```

**正例**

```go
package main  

import (  
    "encoding/json"  
    "log"  
    "time"  
)  

type Task struct {  
    StartTime time.Time `json:"start_time"`  
    TimeoutSecond int `json:"timeout_second"` // 字段名就可以明白是秒  
}  

func main() {  
    t := Task{  
        StartTime: time.Now(),  
        TimeoutSecond: int((time.Second * 30).Seconds()),  
    }  
    s, err := json.Marshal(t)  
    if err != nil {  
        log.Fatalln(err)  
    }  
    log.Println(string(s))  
}  

2022/05/17 17:07:26 {"start_time":"2022-05-17T17:07:26.147585+08:00","timeout_second":30} 

```

当在这些交互中不能使用 time.Time 时，除非达成一致，否则使用 string 和 RFC 3339 中定义的格式时间戳. 默认情况下，Time.UnmarshalText 使用此格式， 并可通过 time.RFC3339 在 Time.Format 和 time.Parse 中使用

需要注意的是，"time" 包不支持解析闰秒时间戳8728，也不在计算中考虑闰秒15190，如果比较两个时间瞬间，则差异将不包括这两个瞬间之间可能发生的闰秒。

## 合理使用 Errors

对于 error 的使用，有几种方式，有各自的优缺点，在选择之前，先考虑具体的情况:

* 对于调用者，是否需要匹配错误信息以便处理? 如果需要，则必须通过声明顶级的错误变量或者自定义类型来支持errors.Is或errors.As函数

* 错误消息是静态的字符串，还是存储有上下文信息的动态字符串? 如果是静态字符串，可以使用errors.New，如果是动态，必须使用fmt.Errorf或者自定义的错误类型

* 错误是否是我们的下游返回的错误? 如果是，参阅之后的错误包装部分

| <br><br>是否需要错误匹配<br><br> | <br><br>错误类型<br><br> | <br><br>使用<br><br> |
| ---- | ---- | ---- |
| <br><br>NO<br><br> | <br><br>静态<br><br> | <br><br>errors.New<br><br> |
| <br><br>NO<br><br> | <br><br>动态<br><br> | <br><br>fmt.Errorf<br><br> |
| <br><br>YES<br><br> | <br><br>静态<br><br> | <br><br>errors.New<br><br>或者自定义顶级错误<br><br> |
| <br><br>YES<br><br> | <br><br>动态<br><br> | <br><br>自定义错误类型<br><br> |

参考：[Best Practices](https://google.github.io/styleguide/go/best-practices)

不需要错误匹配的静态错误

**正例**

```go
package main  

import "errors"  

// 假设这是你写的一个包  

func Open() error {  
    return errors.New("could not open") // new 一个静态的错误返回  
}  

func main() {  
    // 假设这是调用者  
    if err := Open(); err != nil {  
        panic("unknown error")  
    }  
}  
```

不需要错误匹配的动态错误

**正例**

```go
package main  

import (  
    "fmt"  
)  

// 假设这是你写的一个包  

func Open(file string) error {  
    return fmt.Errorf("file %q not found", file) // 返回 format 后的错误  
}  

func main() {  
    // 假设这是调用者  
    if err := Open("demo.txt"); err != nil {  
        // Can't handle the error.  
        panic("unknown error")  
    }  
}  
```

需要错误匹配的静态错误

**正例**

```go
package main  

import "errors"  

// 假设这是你写的一个包  

var ErrCouldNotOpen = errors.New("could not open") // 定义一个静态错误类型，需要是可以导出的  

func Open() error {  
    return ErrCouldNotOpen // 返回指定的错误类型  
}  

func main() {  
    // 假设这是调用者  
    if err := Open(); err != nil {  
        if errors.Is(err, ErrCouldNotOpen) { // errors.Is 判断错误是否是指定的错误类型  
            // handle the error  
        } else {  
            panic("unknown error")  
        }  
    }  
}  
```

需要错误匹配的动态错误

**正例**

```go
package main  

import (  
    "errors"  
    "fmt"  
)  

// 假设这是你写的一个包  

type NotFoundError struct { // 定义一个结构体，为错误使用，需要设置为外部可使用  
    File string // 动态部分  
}  

func (e *NotFoundError) Error() string { // error 方法，传出 format 后的错误信息  
    return fmt.Sprintf("file %q not found", e.File) // 动态信息 format  
}  

func Open(file string) error {  
    return &NotFoundError{File: file} // return时发现是 error类型，会自动调 Error 方法  
}  

func main() {  
    // 假设这是调用者  
    if err := Open("demo.txt"); err != nil {  
        var notFound *NotFoundError  
        if errors.As(err, &notFound) { // errors.As 判断错误是否是这个结构体的方法  
            // handle the error  
        } else {  
            panic("unknown error")  
        }  
    }  
}  
```

【推荐】建议进行 Error 包装。

**说明**：当这个错误是我们的下游返回的错误，我们需要将错误返回给更上级时，我们有三种选择:

* 按照原样返回错误

* 使用 fmt.Errorf 搭配 %w 将错误添加进上下文后返回

* 使用 fmt.Errorf 搭配 %v 将错误添加进上下文后返回如果你没有需要添加的其他上下文，则直接原样返回错误即可，这样保留了原始错误类型和消息，适合上游进行错误追踪，非常适合底层的错误否则，则需要尽可能的在错误消息里添加上下文，这样可以防止模糊的错误信息，比如connection refused之类的，他应该是更详细的，例如call service foo: connection refused此时你需要使用fmt.Errorf来生成一个包含上下文的错误，那么如何选择%w和%v?

* 如果调用者可以访问底层的错误，使用%w，%w可以在传递之后，外部的调用者依旧可以使用errors.Is来进行错误的匹配，更多情况下，%w更推荐使用

* %v会将下游错误进行混淆,导致上游无法进行错误匹配，如果可以修改，将他切换到%w在生成错误信息时，记得避免加上failed to 之类的描述来保证错误信息的简洁， 因为他在返回时，就已经默认是错误信息，不需要特别的指出，另外当错误通过堆栈一层层向上返回时，加入过多的描述会导致错误信息错乱不堪，无法辨认

【推荐】避免滥用%v。

**<font color="red">反例</font>**

```go
package main  

import (  
    "errors"  
    "fmt"  
)  

// 假设这是最下游的一个包  

var ErrCouldNotOpen = errors.New("could not open") // 定义一个静态错误类型，需要是可以导出的  

func Open() error {  
    return ErrCouldNotOpen // 返回指定的错误类型  
}  

// 这是中层的包  

func Demo() error {  
    if err := Open(); err != nil {  
        return fmt.Errorf("open: %v", err) // 返回给上层，%v 将错误信息覆盖  
    }  
    return nil  
}  

func main() {  
    // 假设这是调用者  
    if err := Demo(); err != nil {  
        if errors.Is(err, ErrCouldNotOpen) { // errors.Is 判断错误是否是指定的错误类型，%v 覆盖了错误类型，导致判断失败，Panic  
            // handle the error  
        } else {  
            panic("unknown error")  
        }  
    }  
}  
```

**正例**

```go
package main  

import (  
    "errors"  
    "fmt"  
)  

// 假设这是最下游的一个包  

var ErrCouldNotOpen = errors.New("could not open") // 定义一个静态错误类型，需要是可以导出的  

func Open() error {  
    return ErrCouldNotOpen // 返回指定的错误类型  
}  

// 这是中层的包  

func Demo() error {  
    if err := Open(); err != nil {  
        // 加入的上下文只有 open: 让调用者知道是 open 时的错误即可  
        return fmt.Errorf("open: %w", err) // 返回给上层，%v 将错误信息带入返回  
    }  
    return nil  
}  

func main() {  
    // 假设这是调用者  
    if err := Demo(); err != nil {  
        if errors.Is(err, ErrCouldNotOpen) { // errors.Is 判断错误是否是指定的错误类型，判断成功  
            // handle the error  
        } else {  
            panic("unknown error")  
        }  
    }  
}  
```

需要注意的是，如果错误信息需要传送到另一个系统，例如日志收集，就需要明确告诉这是个错误信息另外，遇到错误，不要选择忽略它或者说不要只是检查错误，而是优雅地处理它们。

【推荐】避免随意给 Error 命名。

**说明**：对于存储为全局变量的错误类型，根据是否需要导出，统一加入前缀Err或者err

**正例**

```go
var (  
    // 导出以下两个错误，以便此包的用户可以将它们与 errors.Is 进行匹配。  
    // 统一使用 Err 作为前缀  

    ErrBrokenLink = errors.New("link is broken")  
    ErrCouldNotOpen = errors.New("could not open")  

    // 这个错误没有被导出，因为我们不想让它成为我们公共 API 的一部分。 我们可能仍然在带有错误的包内使用它。  
    // 统一使用 err 作为前缀  

    errNotFound = errors.New("not found")  
)  
```

对于自定义的错误类型，统一加入后缀Error

**正例**

```go
// 同样，这个错误被导出，以便这个包的用户可以将它与 errors.As 匹配。  

type NotFoundError struct {  
    File string  
}  

func (e *NotFoundError) Error() string {  
    return fmt.Sprintf("file %q not found", e.File)  
}  

// 并且这个错误没有被导出，因为我们不想让它成为公共 API 的一部分。 我们仍然可以在带有 errors.As 的包中使用它。  
type resolveError struct {  
    Path string  
}  

func (e *resolveError) Error() string {  
    return fmt.Sprintf("resolve %q", e.Path)  
}  
```

## 处理类型断言失败

【强制】建议进行断言处理，使用 , ok 方式防止 panic。

**说明**：go 的类型断言会在失败时，以单一返回值形式返回 panic，因此，使用 , ok 方式防止 panic

**<font color="red">反例</font>**

```go
package main  

import "fmt"  

func main() {  
    var s interface{}  
    s = 1  
    t := s.(string) // panic  
    fmt.Println(t)  
}  
```

**检查方式**  
工具检查

**正例**

```go
package main  

import (  
    "fmt"  
    "log"  
)  

func main() {  
    var s interface{}  
    s = 1  
    t, ok := s.(string) // !ok, 不会 panic  
    if !ok {  
        log.Fatalln("error")  
    }  
    fmt.Println(t)  
}  
```

## 不要panic

【强制】避免使用 panic。

**说明**：在生产环境运行的代码必须避免出现 panic，panic 会导致整个程序崩溃，如果发生错误，函数必须捕捉并返回错误，让调用方来进行处理

**<font color="red">反例</font>**

```go
func run(args []string) {  
    if len(args) == 0 {  
        panic("an argument is required") // panic，程序崩溃  
    }  
    // ...  
}  

func main() {  
    run(os.Args[1:])  
}  
```

**正例**

```go
func run(args []string) error {  
    if len(args) == 0 {  
        return errors.New("an argument is required") // 不符合预期的逻辑，捕捉以 error 方式返回，而不是 panic  
    }  
    // ...  
    return nil  
}  

func main() {  
    if err := run(os.Args[1:]); err != nil { // 调用方处理错误  
        fmt.Fprintln(os.Stderr, err)  
        os.Exit(1)  
    }  
}  
```

panic/recover不是经常使用的错误处理策略，仅仅在发生不可恢复的事情(比如空指针)时才 panic，有一个例外: 程序的初始化时发生某些致命错误可能会 panic(比如数据库连接解析错误)即使在测试代码中，也不要使用 panic，应该使用t.Fatal或者t.FailNow来确保失败被标记

**<font color="red">反例</font>**

```go
// func TestFoo(t *testing.T)  

f, err := ioutil.TempFile("", "test")  
if err != nil {  
    panic("failed to set up test")  
} 
```

**正例**

```go
// func TestFoo(t *testing.T)  

f, err := ioutil.TempFile("", "test")  
if err != nil {  
    t.Fatal("failed to set up test")  
} 
```

## 建议使用 go.uber.org/atomic

【推荐】使用go.uber.org/atomic包的原子操作对原始类型（int32，int64等）进行操作。

**说明**：使用 [sync/atomic](https://pkg.go.dev/sync/atomic) 包的原子操作对原始类型 (`int32`, `int64`等）进行操作，因为很容易忘记使用原子操作来读取或修改变量。[go.uber.org/atomic](https://godoc.org/go.uber.org/atomic) 通过隐藏基础类型为这些操作增加了类型安全性。此外，它包括一个方便的`atomic.Bool`类型。

**<font color="red">反例</font>**

```go
type foo struct {
	running int32 // atomic
}

func (f *foo) start() {
	if atomic.SwapInt32(&f.running, 1) == 1 {
		// already running…
		return
	}
	// start the Foo
}

func (f *foo) isRunning() bool {
	return f.running == 1 // race!
}
```

**正例**

```go
type foo struct {
	running atomic.Bool
}

func (f *foo) start() {
	if f.running.Swap(true) {
		// already running…
		return
	}
	// start the Foo
}

func (f *foo) isRunning() bool {
	return f.running.Load()
}
```

## 避免可变的全局变量

【推荐】初始化完成后，尽量避免改变全局变量。

**说明**：在初始化完成后，应该尽量避免改变全局变量，这样会导致可能会出现的，其他地方修改这个全局变量，从而发生预期值外的错误。

**<font color="red">反例</font>**

```go
// sign.go  

var _timeNow = time.Now // 设置一个全局变量  

func sign(msg string) string {  
    now := _timeNow() // 函数中使用这个全局变量  
    return signWithTime(msg, now)  
}  

// main.go  
func Sign(t *testing.T) {  
    oldTimeNow := _timeNow  
    _timeNow = func() time.Time {  
        // 覆盖了全局变量  
        // 此时其他地方调用 sign 会导致出现问题  
        return someFixedTime  
    }  
    defer func() { _timeNow = oldTimeNow }()  
}
```

**正例**

```go
// sign.go  

// 设定结构体，将原本的全局变量设置为结构体的某一个字段  
type signer struct {  
    now func() time.Time  
}  

func newSigner() *signer {  
    // 新建一个新的 singer，而不是全局变量，是这个对象私有的属性  
    return &signer{  
        now: time.Now,  
    }  
}  

func (s *signer) Sign(msg string) string {  
    // 调用时，只使用自己的私有的属性  
    now := s.now()  
    return signWithTime(msg, now)  
}  

// main.go  

func Signer(t *testing.T) {  
    s := newSigner() // 创建一个新的 singer  
    s.now = func() time.Time {  
        // 对属性进行修改，不影响其他使用  
        return someFixedTime  
    }  
}  
```

## 避免在公共结构体中嵌入类型

【推荐】避免在公共结构体中嵌入类型，应作为结构体的某一个字段使用。

**说明**：直接在公共结构体中嵌入类型会导致这个类型的实现细节暴露出去，导致分层失败，同时还会对以后可能的迭代产生阻碍，同时不利于文档的编写假设有一个结构体 AbstractList，实现了Add和Remove方法

```go
type AbstractList struct{}  

func (l *AbstractList) Add(s string) {  
    // ...  
}  

func (l *AbstractList) Remove(s string) {  
    // ...  
}  


func (l *AbstractList) Clean() {  
    // ...  
}  
```

当开发者需要在上游的结构体中使用该类型时，注意不要直接嵌入这个类型，例如

**<font color="red">反例</font>**

```go
package main  

type AbstractList struct{}  

func (l *AbstractList) Add(s string) {  
    // ...  
}  

func (l *AbstractList) Remove(s string) {  
    // ...  
}  


func (l *AbstractList) Clean() {  
    // ...  
}  


// ConcreteList 是一个实体列表。  
// ConcreteList 是公开的结构体  
type ConcreteList struct {  
    *AbstractList // 直接嵌入类型  
}  

func main(){  
    c := ConcreteList{}  
    c.Add("1") // 外部可以直接调用 *AbstractList 的方法，导致分层失败  
    c.Remove("1")  
    c.Clean()  
}  
```

正确的做法应该是作为结构体的某一个字段使用。

**正例**

```go
package main  

type AbstractList struct{}  

func (l *AbstractList) Add(s string) {  
    // ...  
}  

func (l *AbstractList) Remove(s string) {  
    // ...  
}  


func (l *AbstractList) Clean() {  
    // ...  
}  


// ConcreteList 是一个实体列表。  
// ConcreteList 是公开的结构体  
type ConcreteList struct {  
    list *AbstractList // 直接嵌入类型  
}  

// 分层  
func (l *ConcreteList) Add(s string) {  
    // 做一些其他事情，例如校验  
    l.list.Add(s)  
}  

// 分层  
func (l *ConcreteList) Remove(s string) {  
    // 做一些其他事情，例如校验  
    l.list.Remove(s)  
}  

func main() {  
    c := ConcreteList{}  
    c.Add("1") // 调用的是 *ConcreteList 本身的方法  
    c.Remove("1")  
    c.Clean() // 调用失败，因为我不希望你使用  
} 
```

分层可以为之后可能出现的其他逻辑留下空间，避免之后新的需求到来之时对现有的代码进行结构上的破坏性改动，同时也可以避免将某些其他的方法暴露出来。即使AbstractList是接口，也应该保持同样的做法，道理是一样的。

## 避免使用内置的名称

【强制】Go 的预先声明的标识符不能作为名称重复使用。

**说明**：Go 语言规范概述了几个内置的，不应在 Go 项目中使用的预先声明的标识符。根据上下文的不同，将这些标识符作为名称重复使用，将在当前作用域（或任何嵌套作用域）中隐藏原始标识符，或者混淆代码。 在最好的情况下，编译器会报错；在最坏的情况下，这样的代码可能会引入潜在的、难以恢复的错误。

```shell
// # 预先声明的标识符,以下标识符在universe块中隐式声明：  
Types:  
	bool byte complex64 complex128 error float32 float64  
	int int8 int16 int32 int64 rune string  
	uint uint8 uint16 uint32 uint64 uintptr  
  
Constants:  
	true false iota  
  
Zero value:  
	nil  
  
Functions:  
	append cap close complex copy delete imag len  
	make new panic print println real recover
```

**<font color="red">反例</font>**

```go
var error string // 覆盖了 error  
// `error` 本身的作用域隐式覆盖  

// 在函数里 error 也被覆盖  
func handleErrorMessage(error string) {  
    // `error` 作用域隐式覆盖  
}  

type Foo struct {  
    // 虽然这些字段在技术上不构成隐式覆盖，但`error`或`string`字符串在使用中可能会出现覆盖  
    error error  
    string string  
}  

func (f Foo) Error() error {  
    // `error` 和 `f.error` 在视觉上是相似的  
    return f.error  
}  

func (f Foo) String() string {  
    // `string` and `f.string` 在视觉上是相似的  
    return f.string  
}  
```

**检查方式**  
工具检查

**正例**

```go
var errorMessage string  
// `error` 不会被覆盖  


func handleErrorMessage(msg string) {  
    // `error` 不会被覆盖  
}  

type Foo struct {  
    // `error` and `string` 现在是明确的。  
    err error  
    str string  
}  

func (f Foo) Error() error {  
    return f.err  
}  

func (f Foo) String() string {  
    return f.str  
}
```

注意，编译器在使用预先分隔的标识符时不会生成错误，但是诸如go vet之类的工具会正确地指出这些和其他情况下的隐式问题

## 避免使用 init()

【推荐】代码中应该避免使用init()。

**说明**：开发者的代码中应该避免使用init()，当你认为init()是必须需要的，你应该先确认:

* 函数内的处理结果无论程序环境或调用如何，都是完全确定的

* 避免依赖于其他init()函数的顺序或结果. 虽然此刻多个init()顺序是明确的，但代码可能被更改，因此init()函数之间的关系可能会使代码变得脆弱和容易出错.

* 避免访问或操作全局或环境状态，如机器信息、环境变量、工作目录、程序参数/输入等

* 避免I/O，包括文件系统、网络和系统调用

**<font color="red">反例</font>**

```go
// package a  
type Foo struct {  
    // ...  
}  
var _defaultFoo Foo  
func init() {  
    // init 中初始化变量  
    _defaultFoo = Foo{  
        // ...  
    }  
}  

// package b  
type Config struct {  
    // ...  
}  
var _config Config  
func init() {  
    // 获取当前目录  
    cwd, _ := os.Getwd()  
    // 读取目录下文件  
    raw, _ := ioutil.ReadFile(  
        path.Join(cwd, "config", "config.yaml"),  
    )  
    yaml.Unmarshal(raw, &_config)  
}  
```

**正例**

```go
var _defaultFoo = Foo{  
    // ...  
}  
// 使用函数来进行初始化  
var _defaultFoo = defaultFoo()  
func defaultFoo() Foo {  
    return Foo{  
        // ...  
    }  
}  

type Config struct {  
    // ...  
}  
// 开发者手动调用相关函数而不是让其自动执行  
func loadConfig() Config {  
    cwd, err := os.Getwd()  
    // handle err  
    raw, err := ioutil.ReadFile(  
        path.Join(cwd, "config", "config.yaml"),  
    )  
    // handle err  
    var config Config  
    yaml.Unmarshal(raw, &config)  
    return config  
} 
```

考虑到上述情况，在某些情况下，init()可能更可取或是必要的，可能包括：

* 不能表示为单个赋值的复杂表达式。

* 可插入的钩子，如database/sql、编码类型注册表等。

* 对 Google Cloud Functions 和其他形式的确定性预计算的优化，例如regexp.MustCompile(编译正则表达式)

## 建议切片追加时优先指定容量

【推荐】追加切片时，预先估算出最大容量，并在 make 时就指定其容量。

**说明**：在切片需要追加时，尽可能的预先估算出最大容量，并在 make 时就指定其容量目的是减少切片动态扩容带来的时间损耗

**<font color="red">反例</font>**

```go
package main  

import (  
    "fmt"  
    "time"  
)  

func main() {  
    s := time.Now()  
    size := 100000000  
    data := make([]int, 0)  
    fmt.Println(cap(data))  
    for k := 0; k < size; k++ {  
        data = append(data, k)  
    }  
    fmt.Println(cap(data))  
    fmt.Println(time.Since(s)) // 所需时长  
} 
```

**正例**

```go
package main  

import (  
    "fmt"  
    "time"  
)  

func main() {  
    s := time.Now()  
    size := 100000000  
    data := make([]int, 0, size) // 指定容量为 size  
    fmt.Println(cap(data))  
    for k := 0; k < size; k++ {  
        data = append(data, k)  
    }  
    fmt.Println(cap(data))  
    fmt.Println(time.Since(s)) // 所需时长  
} 
```

参考：[Best Practices](https://google.github.io/styleguide/go/best-practices)

## 主函数的退出方式

【强制】优雅的进行主函数的退出。

**说明**：go 程序使用os.Exit或者log.Fatal来进行立即退出，永远记住，不要使用panic来进行退出。并且，只在main()中调用os.Exit和log.Fatal，对于其他函数的退出，要将错误信息返回出来。

**<font color="red">反例</font>**

```go
package main  

import (  
    "fmt"  
    "io/ioutil"  
    "log"  
    "os"  
)  

func main() {  
    body := readFile("a.txt")  
    fmt.Println(body)  
}  

func readFile(path string) string {  
    defer func() {  
        fmt.Println("假如这里进行一些其他清理操作")  
    }()  
    f, err := os.Open(path)  
    if err != nil {  
        log.Fatal(err)  
    }  
    b, err := ioutil.ReadAll(f)  
    if err != nil {  
        // 发送错误，使用 log.Fatal 退出  
        log.Fatal(err)  
    }  
    return string(b)  
}  
```

运行后，发现，defer 中注册的操作无法执行：

```go
2022/06/13 19:21:11 open a.txt: no such file or directory  
exit status 1
```

**检查方式**  
工具检查

在其他函数中通过以上两种方式直接退出程序有几个隐患:

* 不明显的控制流: 任何函数都可以导致程序退出，因此很难对处理逻辑进行控制和分析

* 难以测试: 如果你的test 测试代码调用了函数，而在函数内导致程序退出，同样导致整个测试流程退出，无法继续进行

* 跳过清理: 一般的，我们使用 defer 来进行一些资源清理操作，例如连接的关闭，文件句柄关闭等，但是当函数直接退出时，defer 中的代码不会被执行

**正例**

```go
package main  

import (  
    "errors"  
    "fmt"  
    "io/ioutil"  
    "log"  
    "os"  
)  

func main() {  
    if err := run(); err != nil {  
        // 主函数进行退出  
        log.Fatal(err)  
    }  
}  
func run() error {  
    defer func() {  
        fmt.Println("资源回收")  
    }()  
    args := os.Args[1:]  
    if len(args) != 1 {  
        return errors.New("missing file")  
    }  
    name := args[0]  
    f, err := os.Open(name)  
    if err != nil {  
        return err  
    }  
    defer f.Close()  
    b, err := ioutil.ReadAll(f)  
    if err != nil {  
        return err  
    }  
    // ...  
    fmt.Println(b)  
    return nil  
}  


资源回收  
2022/06/13 19:30:29 missing file  
exit status 1  
```

### 一次性退出

【推荐】每个main()一次性退出。

**说明**：如果可以的话，在每个main()中最多调用一次os.Exit或者log.Fatal，如果有多个错误场景，应该将程序结束，此时应该将逻辑单独放置在单独的错误函数中，通过返回错误来让 main 来进行退出，这样会缩短 main 函数，同时将关键业务逻辑放置在了单独的，可以进行测试的函数中

**<font color="red">反例</font>**

```go
package main  

import (  
    "fmt"  
    "io/ioutil"  
    "log"  
    "os"  
)  

func main() {  
    args := os.Args[1:]  
    if len(args) != 1 {  
        log.Fatal("missing file")  
    }  
    name := args[0]  
    f, err := os.Open(name)  
    if err != nil {  
        // fatal  
        log.Fatal(err)  
    }  
    defer f.Close()  
    defer func() {  
        fmt.Println("清理")  
    }()  
    b, err := ioutil.ReadAll(f)  
    if err != nil {  
        // defer 同样并不会被执行  
        log.Fatal(err)  
    }  
    // ...  
    fmt.Println(b)  
} 
```

**正例**

```go
package main  

import (  
    "errors"  
    "fmt"  
    "io/ioutil"  
    "log"  
    "os"  
)  

func main() {  
    if err := run(); err != nil { // 统一进行判断  
        log.Fatal(err)  
    }  
}  
func run() error {  
    args := os.Args[1:]  
    if len(args) != 1 {  
        // err 0  
        return errors.New("missing file")  
    }  
    name := args[0]  
    f, err := os.Open(name)  
    if err != nil {  
        // err 1  
        return err  
    }  
    defer f.Close()  
    b, err := ioutil.ReadAll(f)  
    if err != nil {  
        // err 2  
        return err  
    }  
    // ...  
    fmt.Println(b)  
    return nil  
}  
```

## 在序列化的结构体中使用 tag

【推荐】在序列化的结构体中使用 tag，结构的序列化方式，便于不同系统之间交流的约定。

**说明**：任何序列化到 json/YAML 或者其他支持基于 tag 来进行字段命名的格式，都应该使用 tag 来进行注释。因为，结构的序列化方式，是不同系统之间交流的约定，而对字段的修改会导致破坏约定. 使用加入 tag 的方式，可以使约定更加明确和易读. 并且在重构和重命名字段时，只要不动 tag，就无需重新约定结构

**<font color="red">反例</font>**

```go
package main  

import (  
    "encoding/json"  
    "fmt"  
)  

func main() {  
    type Stock struct {  
        // json 在没有 tag 时默认按照字段名  
        // 当后续字段名有调整导致 json 结构发生变化  
        Price int  
        Name string  
    }  
    bytes, err := json.Marshal(Stock{  
        Price: 137,  
        Name: "UBER",  
    })  
    fmt.Println(err)  
    fmt.Println(string(bytes))  
}  
```

**正例**

```go
package main  

import (  
    "encoding/json"  
    "fmt"  
)  

func main() {  
    type Stock struct {  
        // json 根据 json tag 来进行命名  
        // 当后续字段名调整，只要 tag 不动，则无需重新约定 json 结构  
        Price int `json:"price"`  
        Name string `json:"name"`  
    }  
    bytes, err := json.Marshal(Stock{  
        Price: 137,  
        Name: "UBER",  
    })  
    fmt.Println(err)  
    fmt.Println(string(bytes))  
}
```
