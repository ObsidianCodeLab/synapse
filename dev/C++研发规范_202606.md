# 适用对象

C++后台开发人员、后台测试人员。

# 目的

为了持续、稳定地开发出高质量，健壮的软件系统，为了保证团队中成员的编码质量，特制定本文档。用于规范团队内部开发过程，增加程序的健壮性，便于后续测试及代码维护，最终提高公司软件产品的生产力。

# 编程规范

- 【**原则**】开发人员在编写代码过程中需要恪守的基本准则，在日常工作中需要在基本原则的指导下完成代码开发任务。
- 【**规则**】开发人员在日常开发过程中必须严格遵守的规则，这是系统代码得以正常稳定运行的基础，是以团队合作方式进行软件开发的基本保证。
- 【**建议**】建议部分提出的内容，希望员工能够尽量遵守，这些内容是经验丰富的开发人员在长期开发中积累的宝贵经验教训，有助于编写出高质量的代码。

## 基本原则

### 【原则1-1】简明优先，避免复杂

**说明**：简单是最美。保持代码的简单化是软件工程化的基本要求。不要过分追求技巧，否则会降低程序的可读性。

### 【原则1-2】正确优先，效率次之

**说明**：编程首先考虑的是满足正确性、健壮性、可维护性、可移植性等质量因素，最后才考虑程序的效率和资源占用。

### 【原则1-3】复用为本，拒绝重复

**说明**：尽量选择可借用的代码，对其修改优化以达到自身要求。

> 《重构——改进现有代码的设计》一书中说到重复是代码中最大的坏味道，会带来维护上的困难。编写代码应该尽可能避免任何形式的重复。事实上编程语言的发展就是为了减少重复，降低程序的复杂度。宏定义、函数、类，这些都是具体的避免重复的机制。

### 【原则1-4】 持续改进，避免错误复现

**说明**：事实上，我们无法做到完全消除错误，但通过不懈的努力，可以减少同样的错误出现的次数。

## 布局、注释、命名规则

### 【规则2-1】大括号独占一行，内部缩进4空格

**说明**：程序的分界符`{`和`}`应独占一行并且位于同一列，同时与引用它们的语句左对齐。 `{ }` 之内的代码块使用缩进规则对齐
**检查方式**：代码走查结合排版工具（如astyle、clang-format）检查处理

**<font color=red>反例</font>**

```cpp
int main(int argc, char **argv) {
...
...
}
```

**正例**

```cpp
int main(int argc, char **argv)
{
    ...
    ...
}
```

### 【规则2-2】类访问修饰符与分界符对齐，辖属内容要缩进

**说明**：声明类的时候，`public`、`protected`、`private`关键字与分界符{} 对齐，这些部分的内容要缩进4空格
**检查方式**：代码走查结合排版工具（如astyle、clang-format）检查处理

**<font color=red>反例</font>**

```cpp
class TBase
{
    public:
    TBase();
    virtual ~TBase();
    protected:
    int m_iNumber;
};
```

**正例**

```cpp
class TBase
{
public:
    TBase();
    virtual ~TBase();
protected:
    int m_iNumber;
};
```

### 【规则2-3】分支循环必加大括号，禁止单行简写

**说明**： `if`、`else`、`else if`、`for`、`while`、`do`等语句自占一行，执行语句不得紧跟其后；并且不论执行语句有多少都要加 `{}`，以便在分支条件中追加语句时能够在分支作用域`{}`中。
**检查方式**：代码走查结合排版工具（如astyle、clang-format）检查处理

**<font color=red>反例</font>**

```cpp
if (...) {
    return 1;
} else 
    return 0;
```

**正例**

```cpp
if (...)
{
    return 1;
}
else 
{
    return 0;
}
```

### 【规则2-4】头文件中禁止使用using namespace

**说明**：为了防止被其他文件包含时，因为using namespace而引起类、函数、枚举等命名的冲突。
**检查方式**：代码走查

**<font color=red>反例</font>**

```cpp
// TestUtil.h
#ifndef _T_TESTUTIL_H
#define _T_TESTUTIL_H
using namespace std;
...
#endif //_T_TESTUTIL_H
```

**正例**

```cpp
// TestUtil.cpp
#include "TestUtil.h"
using namespace std;
...
```

### 【规则2-5】遵循统一的类定义布局顺序

**说明**：

1. **访问权限顺序**：`public` → `protected` → `private`
2. **内容排列**：函数在前，成员变量在后
3. **接口优先**：构造和析构函数放最前（单例模式例外），公共接口紧随其后

**检查方式**：代码走查

**<font color=red>反例</font>**

```cpp
class TBase
{
private:
    int m_iNumber;
    int GetProdNum();
public:
    TBase();
    virtual ~TBase();
};
```

**正例**

```cpp
class TBase
{
public:
    TBase();
    virtual ~TBase();
protected:
    int GetProdNum();
    int m_iNumber;
};
```

### 【规则2-6】新增文件采用doxygen文件头代码注释风格

**说明**：当需要新增一个代码文件时，需要将**正例**中所示的注释放在文件的开头位置，认真填写内容（文件名、功能简述、作者、日期等信息），每次对本文件进行较大改动时，也需要在注释里面进行说明
**检查方式**：代码走查结合排版工具（如clang-format）生成处理

**<font color=red>反例</font>**

```cpp
/* Test.h */
```

**正例**

```cpp
/********************************************************
*   Copyright (c) 2003-2021 Whale Cloud Technology Co.,Ltd.
*
*	All rights rescrved.
*
*	@file      (本文件的文件名eg：Test.h)
*	@brief     (本文件实现的功能的描述)
*
*	@author	(作者)
*	@date	    (完成日期)
*	@warning	(公用功能，统一使用)
*********************************************************/
```

### 【规则2-7】头文件必须使用预处理块来避免重复包含

**说明**： 头文件必须要使用`#ifndef/#define/#endif` 预处理块，来避免此文件被重复包含而引起的编译错误。C++是不允许一个类被多次定义，即使这些重复的定义是完全相同的。
**检查方式**：代码走查

**<font color=red>反例</font>**

```cpp
// TestUtil.h
#ifndef _T_TESTUTIL_H
...
#endif //_T_TESTUTIL_
```

**正例**

```cpp
// TestUtil.h
#ifndef _T_TESTUTIL_H
#define _T_TESTUTIL_H
...
#endif //_T_TESTUTIL_
```

### 【规则2-8】包含标准库头文件用尖括号，包含本地头文件用双引号

**说明**：

- 尖括号`<>`表示优先从系统库路径中寻找头文件
- 双引号`""`表示优先从当前目录或指定的附加路径(框架或模块路径)寻找头文件。

**检查方式**：代码走查

**<font color=red>反例</font>**

```cpp
#include "stdlib.h"
#include <TestUtil.h>
```

**正例**

```cpp
#include <stdlib.h>
#include "TestUtil.h"
```

### 【规则2-9】保证代码和注释的一致性

**说明**：保证代码和注释的一致性，修改代码的同时也要修改相应的注释，不再有用的注释要删除

<font color=red>**[UR：98723](https://zmp.iwhalecloud.com/queryTransDtl.action?transid=98723)**</font> 不再有用的注释与实际代码实现相矛盾，会对代码的实现产生歧义，增加代码维护复杂度，所以应该及时删除。

**检查方式**：代码走查结合排版工具（如clang-format）检查处理

**<font color=red>反例</font>**

```cpp
// Ur:98723 以账期结束时间-1s为事件开始时间
// UR:100101 修改为以账期开始时间为事件开始时间
m_pRecurringEvent->SetAttr(EA::EVENT_BEGIN_TIME, m_pBillingCycleInfo->pRecord->dCycleBeginDate);
```

**正例**

```cpp
// UR:100101 修改为以账期开始时间为事件开始时间
m_pRecurringEvent->SetAttr(EA::EVENT_BEGIN_TIME, m_pBillingCycleInfo->pRecord->dCycleBeginDate);
```

### 【规则2-10】代码注释广覆盖

**说明**：类、类非私有成员函数、类成员变量、全局变量、对外公开函数都需要有完整注释说明

**检查方式**：代码走查结合排版工具（如clang-format）检查处理

**<font color=red>反例</font>**

枚举值无注释说明

```cpp
EXP_DATEEXTEND_UNIT_TYPE =912,
EFF_DATE_UNIT_TYPE=913,
```

**正例**

枚举值注释说明

```cpp
//Ur:98723
UP_DATA_CDR = 1232, ///上传数据流量生成CDR话单使用不做计费属性  
```

- 类的注释：

  ```cpp
  /**
  *	@brief	应用程序基类
  *	(详细说明)
  */
  class ClassTest
  {
  }
  ```

- 枚举的注释：

  ```cpp
  /**
  *	@brief	枚举说明
  *	(详细说明)
  */
  enum TEnum   
  {   
  	RED,            /// 枚举，标识红色      
  	BLUE,           /// 枚举，标志蓝色      
  	YELLOW          /// 枚举，标志黄色.     
  }enumVar;
  ```

- 变量的注释：(全局变量、类成员变量要有注释)

  ```cpp
  int	  g_iVal;        /// 变量的说明
  ```

### 【规则2-11】宏与常量命名全大写加下划线

**说明**：

- **宏与常量全大写**：所有宏、常量名必须全大写字母，单词用下划线 `_` 分隔
- **预编译开关加下划线**：预编译宏定义（如 `#ifdef` 检测的开关）以下划线 `_` 开头

**检查方式**：代码走查

**<font color=red>反例</font>**

```cpp
// Event_Begin_time宏定义
#define Event_Begin_time  10001

// 预编译开关DEBUG
#if defined(DEBUG)
...
#endif
```

**正例**

```cpp
// EVENT_BEGIN_TIME宏定义
#define EVENT_BEGIN_TIME  10001

// 预编译开关_DEBUG
#if defined(_DEBUG)
...
#endif
```

### 【规则2-12】变量名由前缀+主体组成，函数名由动名词组成

**说明**：

1. **变量名结构**：
   - **前缀**：标识类型/作用域（例如： `i` 表示 int，`p` 表示指针， `g_` 表示全局）
   - **主体**：`名词`或`形容词+名词`，单词首字母大写（如 `iRetCode`、`sUserName`），方便明确变量用途
2. **函数名结构**：
   - **动词或动词+名词**：明确函数行为（如 `CreateThread()` 表示创建线程）。
   - **单词首字母大写**：与变量名区分，提升代码可读性。

**检查方式**：代码走查

**<font color=red>反例</font>**

```cpp
void setSubsId(int isubsid)
{
    ...
}
```

**正例**

```cpp
void SetSubsId(int iSubsId)
{
    ...
}
```

### 【规则2-13】变量名前缀可快速识别变量类型和作用域

**说明**：使用一致的前缀来区分变量的作用域，使用一致的小写类型指示符作为前缀来区分变量的类型

- **类型前缀列表：**

  | 前缀 | 类型                   | 示例           |
  | :--- | :--------------------- | :------------- |
  | `i`  | int                    | `iCount`       |
  | `f`  | float                  | `fSpeed`       |
  | `d`  | double                 | `dDistance`    |
  | `c`  | char                   | `cKey`         |
  | `uc` | unsigned char 或 BYTE  | `ucFlag`       |
  | `l`  | long                   | `lTimeout`     |
  | `ll` | long long              | `llFileSize`   |
  | `p`  | pointer                | `pBuffer`      |
  | `pp` | pointer to pointer     | `ppMatrix`     |
  | `b`  | bool                   | `bIsReady`     |
  | `h`  | HANDLE                 | `hFile`        |
  | `w`  | unsigned short 或 WORD | `wPort`        |
  | `dw` | DWORD或 unsigned long  | `dwErrorCode`  |
  | `a`  | 数组，array of TYPE    | `aScores`      |
  | `s`  | 字符串                 | `sFileName`    |
  | `t`  | 结构类型               | `tUserInfo`    |
  | `o`  | 对象                   | `oHttpClient`  |
  | `tm` | struct tm              | `tmCreateTime` |
  | `tt` | time_t                 | `ttExpireTime` |

- **作用域前缀列表：**

  - **g_     ： 全局变量**
  - **s_     ： 全模块内静态变量**
  - **空     ： 局部变量（包括函数内的静态局部变量）不加范围前缀**

**检查方式**：代码走查

**<font color=red>反例</font>**

```cpp
int count;
char name[32];
```

**正例**

- 全局变量

  ```cpp
  long long g_llSubsId;
  ```

- 模块静态变量

  ```cpp
  time_t s_ttNextExeTime;
  ```

- 局部变量

  ```cpp
  char sUserName[32];
  ```

### 【规则2-14】类的非公用成员变量名要加m_前缀

**说明**：类变量命名规则，对于类的变量，public的变量不应该以m\_ 打头，protected，private变量则需要以m\_ 打头

1. **public 成员变量**：**不加 `m_` 前缀**，直接使用类型前缀+名词（如 `iCount`）。因为这类变量通常的使用方式是`a.iSubsId`或者`a->iSubsId`，已经可以达到区分其它变量的目的，没有必要增加多余的前缀。
2. **protected/private 成员变量**：**必须加 `m_` 前缀**（如 `m_iCount`），为了在类成员函数中同临时函数变量和参数传入变量区分开来。
3. 如果在成员函数中使用公用成员变量，建议`this->iSubsId`的方式 来调用。当然，除非类的作用为数据类，我们不建议将类的成员变量声明为public

**检查方式**：代码走查

**<font color=red>反例</font>**

```cpp
class A
{
public:
     int m_iSubsId; ///变量说明
protected:
     bool bFlag; ///变量说明
private:
     char sStr[32]; ///变量说明
};
```

**正例**

```cpp
class A
{
public:
     int iSubsId; ///变量说明
protected:
     bool m_bFlag; ///变量说明
private:
     char m_sStr[32]; ///变量说明
};
```

### 【规则 2-15】程序中禁止出现仅靠大小写区分的标识符

**说明**：仅靠大小写区分的标识符可读性差，代码修改时还可能因手误导致逻辑错误。

**检查方式**：代码走查

**<font color=red>反例</font>**

```cpp
void GetHumanInfo(void)
{
    int count, Count, COUNT;
    char sName[16], sNAme[32];
    …
}
```

**正例**

```cpp
void GetHumanInfo(void)
{
    int iMaleCount = 0;
    int iFemaleCount = 0;
    int iHumanCount =0;
    …
}
```

### 【规则2-16】代码缩进统一采用4个空格

**说明**：统一使用4个空格缩进，禁止混合空格与制表符，因为制表符在不同编辑器中宽度可能不同，导致代码结构清晰度差，不利于代码的阅读；

**检查方式**：代码走查结合排版工具（如astyle、clang-format）检查处理

**说明**：

在**visual studio**中有良好的自动化代码格式处理，请善用这些特性：

- **设置缩进**：工具->选项->文本编辑器->C/C++->制表符：将两个值统一设成`4`
- **自动调整代码格式**：选中要调整的代码，编辑->高级->设置选定内容的格式

在**UE**中，可以通过：高级->配置->编辑器->自动换行/制表符设置，见下图：

![image](uploads/4081/dec29eb8-f377-4142-9fae-1426f650a952/image-20210726155710021.png)

**<font color=red>反例</font>**

```cpp
void Foo(void)
{
  int iTest = 1;

  if (iTest > 10)
  {
	printf("iTest > 10\n");
  }
  else
  {
	printf("iTest <= 10\n");
  }
}
```

**正例**：

```cpp
void Foo(void)
{
    int iTest = 1;

    if (iTest > 10)
    {
        printf("iTest > 10\n");
    }
    else
    {
        printf("iTest <= 10\n");
    }
}
```

### 【规则2-17】类的公有/保护函数要加详细的注释

**说明**：

- **必须注释对象**：`public`/`protected` 函数必须添加 Doxygen 风格注释，以方便后续被其他程序员调用。
- **注释必含关键字**：`@brief`（功能）、`@param`（参数）、`@return/retval`（返回值）。
- **注释可选关键字**：`@note`（注意）、`@see`（参考）、`@throw`（异常）等。
- **Python接口必须严格遵守**：跨语言接口函数注释需完整，参数类型和返回值明确。

**检查方式**：代码走查结合排版工具（如clang-format）检查处理

**<font color=red>反例</font>**

```cpp
class TBase
{
public:
    TBase();
    virtual ~TBase();
    /* GetProdNum */
    int GetProdNum(int iProdType);
};
```

**正例**

```cpp
/**
*	@brief	函数说明
*	(详细说明)
*	@param pszFrom [in]  源字符串
*	@param pszTo [in/out]  拷贝的目的地址
*	@param nSize [in]  空间大小
*	@return char*  返回值说明
*/
static char* Fun(const char *pszFrom, char* pszTo, size_t nSize);
```

### 【规则2-18】源文件命名采用驼峰式

**说明**：

1. **文件名格式**：单词首字母大写，无下划线（驼峰式，如 `DataProcessor.h`）。
2. **头文件与实现文件同名**：`.h` 和 `.cpp` 必须成对且同名（如 `Logger.h` 和 `Logger.cpp`）。
3. **目录唯一性**：禁止不同目录下存在同名文件（如 `src/utils/Logger.h` 和 `src/core/Logger.h` 冲突）。

**检查方式**：代码走查

**<font color=red>反例</font>**

```cpp
Test_Util.cpp
test_util.cpp
testutil.cpp
```

**正例**

```cpp
TestUtil.cpp
TestUtil.h
```

### 【规则2-19】库文件与可执行文件名全部小写

**说明**：

1. **命名格式**：全小写字母，单词间可用下划线 `_` 分隔。
2. **禁止形式**：驼峰式、连字符（`-`）、无分隔符

**检查方式**：代码走查

**<font color=red>反例</font>**

```cpp
LibTestUtil.so
Lib_Test_Util.so
```

**正例**

```cpp
libtestutil.so
libtest_util.so
```

### 【规则2-20】源码目录名遵循全部小写

**说明**：

1. **全小写命名**：目录名所有字母必须小写（如 `src`、`utils`）。
2. **单词分隔**：单词间可用下划线 `_` 连接（如 `test_cases`）。
3. **禁止形式**：驼峰式、连字符（`-`）、大写字母。

**检查方式**：代码走查

**<font color=red>反例</font>**

```cpp
Src
CONF
```

**正例**

```cpp
src
data
conf
```

### 【建议2-1】单函数行数应控制在200-300行以内

**说明**：为了函数简洁，让梳理、阅读理解更容易。

### 【建议2-2】每行代码和注释尽量不要超过80列

**说明**：一行太长在一些显示器中无法显示完，需要辅以滚动条查看整行代码。

### 【建议2-3】Protobuf 应通过协议文件.proto自动生成源码

**说明**：使用**Google Protocol Buffer**协议时需注意

1. **源码只保留 `.proto` 文件**：协议定义文件需纳入版本控制，不应保留`.pb.cc/h`文件。
2. **编译时自动生成代码**：通过构建工具（如 CMake）动态生成目标代码`.pb.cc/h`，确保与协议文件严格同步。
3. **禁止手动修改生成文件**：生成代码为只读，任何修改需通过更新 `.proto` 文件实现。

例如，使用**cmake**时构建时，`CMakeLists.txt`编写如下：

```cmake
set(INPUT_DIR ${CMAKE_CURRENT_SOURCE_DIR})
file(GLOB PROTO_INPUT ${CMAKE_CURRENT_SOURCE_DIR}/*.proto)
set(PROTOC_C_OUT_FLAG --cpp_out)
set(PROTO_GEN_DIR ${CMAKE_CURRENT_SOURCE_DIR})

foreach(PROTO_FILE ${PROTO_INPUT})
    get_filename_component(PROTO_NAME ${PROTO_FILE} NAME_WE)
    set(CUR_PROTO_GEN
            ${PROTO_GEN_DIR}/${PROTO_NAME}.pb.h
            ${PROTO_GEN_DIR}/${PROTO_NAME}.pb.cc
            )
    set(PROTO_GEN
            ${PROTO_GEN}
            ${CUR_PROTO_GEN}
            )
     add_custom_command(
            OUTPUT ${CUR_PROTO_GEN}
            COMMAND $ENV{PROTOBUF_HOME}/bin/protoc ${PROTO_FILE} ${PROTOC_C_OUT_FLAG} ${PROTO_GEN_DIR}
            -I${INPUT_DIR}
            DEPENDS ${PROTOC} ${PROTO_FILE}
            WORKING_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}
    )
endforeach(PROTO_FILE ${PROTO_INPUT})

add_library(rulecache_loadfromfile_pb SHARED ${PROTO_GEN})
```

### 【建议2-4】新产品研发优先使用Cmake编译配置工具

**Cmake**（**cross platform make**）是一个跨平台的安装编译工具，可以用简单的语句来描述所有平台的安装(编译过程)。

**CMake**优势：

- 开放源代码，使用**BSD**许可证发布。
- 跨平台，可以生成**native**编译配置文件。在**linux/unix**平台可以生成**makefile**，在**mac**平台可以生成**xcode**，在**windows**平台可以生成**msvc**工程的配置文件。
- 能够管理大型项目
- 简化编译构建过程和编译过程，只需要**cmake+make**就可以
- 高效率，支持增量编译，并行编译等。比**Scons**和传统的**makefile**效率更高。
- 可扩展，可以为**cmake**编写特定功能的模块，扩充**cmake**功能

## 变量、表达式、函数

### 【规则3-1】全局变量慎定义，注释需含用途、范围和关联性

**说明**：全局变量易导致模块间隐式依赖，增加调试和维护难度，因此应该慎用。而详尽注释能够帮助团队快速理解变量用途和约束条件。

1. **定义前分析**：明确变量的含义、作用、取值范围及与其他全局变量的关系。
2. **注释强制要求**：
   - **用途含义**：变量在系统中的角色作用（如“缓存用户会话数据”）。
   - **取值范围**：合法值范围或约束（如`0 ≤ g_iMaxThread ≤ 100`）。
   - **关联关系**：与其他变量的依赖或互斥关系（如“与 `g_cacheSize` 联动调整”）。

**检查方式**：代码走查

**<font color=red>反例</font>**

```cpp
int g_iValue = 0;
```

**正例**

```cpp
int  g_iValue = 0;  /// 全局变量的含义、作用及取值范围等的详细说明
```

### 【规则3-2】临时变量单一职责且作用域最小化

**说明**：

1. **单一职责**：每个变量仅服务于一个明确功能，禁止混用；提升可读性和维护性。
2. **就近声明**：在离首次使用最近的位置定义变量，非函数开头集中声明，避免未使用的变量占用内存。
3. **避免复用**：不同作用域的变量禁止复用，降低意外修改风险

**检查方式**：代码走查

**<font color=red>反例</font>**

```cpp
int iCount = 0;
int iIndex = 0;
...
iCount = GetCount();
for (iIndex = 0; iIndex < iCount; iIndex++)
{
    ...
}
```

**正例**

```cpp
int iCount = GetCount();
for (int iIndex = 0; iIndex < iCount; iIndex++)
{
    ...
}
```

### 【规则3-3】非特殊场景应避免使用static变量

**说明**：`static`变量值将跨作用域存在，使用不当很容易造成由于变量值错误导致程序的错误

1. **避免使用**：除非必须（如单例模式、性能优化或特殊功能需求），否则禁用 `static` 变量。
2. **替代方案**：优先用局部变量、参数传递或对象成员变量替代。
3. **线程安全**：若必须使用，需确保线程安全（如加锁或原子操作）。

**检查方式**：代码走查

### 【规则3-4】仅做输入用的指针或引用参数应使用 const 修饰

**说明**：

1. **输入指针需加 `const`**：若指针参数仅用于读取数据（不修改其指向内容），需在类型前加 `const`。
2. **防止意外修改**：通过编译器强制约束，避免函数内部误操作修改输入数据。
3. **明确语义**：向调用者表明该参数为只读，增强代码可读性。

**检查方式**：代码走查

**<font color=red>反例</font>**

pBaseObject仅做输入用时

```cpp
void Fun(TBaseObject* pBaseObject);
```

**正例**

pBaseObject仅做输入用时

```cpp
void Fun(const TBaseObject* pBaseObject);
```

### 【规则3-5】类对象的传递尽量使用地址或者引用方式。

**说明**：

1. **类对象传递**：优先使用 `const &` 或指针传递，避免使用值传递，从而避免临时对象的构造/析构开销，提升性能。
2. **内置类型传递**：直接使用值传递，无需加 `const`。包括`int`, `long`, `double`，`float`, `char`, `bool`等

**检查方式**：代码走查结合编译器告警处理

**<font color=red>反例</font>**

```cpp
void Fun(const long lSubsId);
```

**正例**

```cpp
void Fun(const TBaseObject& tBaseObject);
```

### 【规则3-6】防止将函数的参数作为工作变量

**说明**：将函数的参数作为工作变量，如果非按值传递参数时可能导致值出错。如果按值传递参数时，将导致程序性能降低。对必须改变的参数，声明一个临时变量进行取代，最后再将该局部变量的内容赋给该参数，避免中间处理过程可能错误地改变参数内容。

**检查方式**：代码走查

**<font color=red>反例</font>**

```cpp
void Fun(long lSubsId)
{
    if (lSubsId <= 0)
    {
        lSubsId = GetSubsId();
    }
    ...
}
```

**正例**

```cpp
void Fun(long lSubsId)
{
    long lTempSubsId = lSubsId;
    if (lTempSubsId <= 0)
    {
        lTempSubsId = GetSubsId();
    }
    ...
}
```

### 【规则3-7】对所调用的函数的返回值要处理完备

**说明**：这样能够避免到一些潜在的函数调用失败没有及时处理，影响后续逻辑（甚至coredump）。

1. **全返回值检查**：必须显式处理函数的所有返回值，包括成功、失败和边界状态。
2. **错误兜底处理**：对错误返回值需明确处理逻辑（如返回错误码、抛异常、日志记录等）。
3. **资源安全释放**：调用可能失败的函数后，需确保已申请的资源被正确释放。

参考故障分析[UR:31317466](https://dev.iwhalecloud.com/portal/zcm-devspace/spa/task/pc/31317466)，流媒体服务在获取视频流对象指针失败后，未进行结果有效性检查，因为空指针访问最终导致了流媒体服务崩溃重启。

**检查方式**：代码走查结合cppcheck工具检查处理

> **备注**：CPPCHECK已经支持fopen/fread/fseek/fwrite/rename/readdir/system检测，本次补充pthread_create、shmget、shmat、msgget、msgrcv、msgsnd、msgctl、shmctl

**<font color=red>反例</font>**

```cpp
pthread_create(&tThreadId, &tAttr, TestThreadMain, NULL);
...
```

**正例**

```cpp
int iRet = pthread_create(&tThreadId, &tAttr, TestThreadMain, NULL);
if (iRet != 0) 
{
    ...
}
...
```

### 【规则3-8】函数返回值全路径覆盖

**说明**：

1. **初始化返回值**：函数返回值变量在定义时初始化。
2. **全分支返回**：所有条件分支（包括 `if-else`、`switch-case`、`try-catch`）必须显式返回有效值。
3. **禁用隐式返回**：禁止依赖未定义的默认返回值（如未初始化变量的随机值）。

**检查方式**：代码走查结合编译器告警或**cppcheck**处理

**<font color=red>反例</font>**

```cpp
int Fun(long lSubsId)
{
    int iRet;
    if (lSubsId < 0)
    {
        ...
        return iRet;
    }
    else if (lSubsId > 0)
    {
        iRet = FunOther(lSubsId);
        return iRet;
    }
}
```

**正例**

```cpp
int Fun(long lSubsId)
{
    int iRet = RET_ERR;
    if (lSubsId < 0)
    {
        ...
        return iRet;
    }
    else if (lSubsId > 0)
    {
        iRet = FunOther(lSubsId);
        return iRet;
    }
    return iRet;
}
```

### 【规则3-9】派生类赋值函数中需要对基类的成员变量赋值

**说明**：因为派生类的赋值函数不会自动为基类成员赋值。

1. **显式调用基类赋值**：在派生类赋值函数中，必须手动调用基类的赋值函数（或直接为基类成员变量赋值）。
2. **避免基类数据残留**：未显式处理基类成员时，其数据可能保留旧值，导致对象状态不一致。

**检查方式**：代码走查

**<font color=red>反例</font>**

```cpp
class Student
{
public:
    ...
    Student& operator=(const Student & another)
    {
        if(this == &another)
        {
            return *this;
        }
        m_strName = another.m_strName;
        m_iAge = another.m_iAge;
        m_fScore = another.m_fScore;
        return *this;
    }

private:
    string m_strName;
    int m_iAge;
    float m_fScore;
};

class GraduateStudent: public Student
{
public:
    ...
    GraduateStudent& operator=(const GraduateStudent& another)
    {
        if(this == &another)
        {
            return *this;
        }
        m_dSalary = another.m_dSalary;
        return *this;
    }

private:
    double m_dSalary;
};
```

**正例**

```cpp
class Student
{
public:
    ...
    Student& operator=(const Student & another)
    {
        if(this == &another)
        {
            return *this;
        }
        m_strName = another.m_strName;
        m_iAge = another.m_iAge;
        m_fScore = another.m_fScore;
        return *this;
    }

private:
    string m_strName;
    int m_iAge;
    float m_fScore;
};

class GraduateStudent: public Student
{
public:
    ...
    GraduateStudent& operator=(const GraduateStudent& another)
    {
        if(this == &another)
        {
            return *this;
        }
        Student::operator = another;  // Student基类赋值
        m_dSalary = another.m_dSalary;
        return *this;
    }

private:
    double m_dSalary;
};
```

### 【规则3-10】文件句柄打开使用完后要及时关闭

**说明**：因为进程能够同时打开的文件句柄数是有限，如果出现未完成关闭的句柄，那么当超过限制时，会无法打开新的文件。

1. **谁申请谁释放**：在函数内打开的文件句柄，当无需传递给其它函数使用时，必须在同一函数内关闭。
2. **句柄传递例外**：若句柄需传递给其他函数使用，需明确接收方负责关闭。
3. **全路径关闭**：确保所有分支（正常返回、异常、错误处理）均能关闭文件句柄。
4. **强制落盘**：当进行写文件操作时，需要根据场景进行磁盘同步处理
   - 对于重要的业务数据或控制文件，在关闭文件前，必须使用`fflush`和`fsync`/`fdatasync`来强制将文件内容同步到磁盘中
   - 对于大文件或大量文件批量处理时，需要具备定时或定量控制策略来主动使用`fsync`/`fdatasync`，避免系统集中刷盘可能引起的磁盘繁忙
   - 结合业务异常恢复逻辑以及数据丢失容忍度情况，可酌情考虑适当的时候使用`fsync`/`fdatasync`来及时同步数据到磁盘

**检查方式**：代码走查

**<font color=red>反例</font>**

```cpp
int main() {
    FILE *pf = fopen("demo.txt", "r");
    if (pf == NULL) 
    {
        puts("Fail to open file!");
        exit(1);
    }
    char sLine[MAX_LINE_LENGTH];
    while(fgets(sLine, MAX_LINE_LENGTH, pf) != NULL) 
    {
        printf("%s", sLine);
    }
    return 0;
}
```

**正例**

```cpp
int main() {
    FILE *pf = fopen("demo.txt", "r");
    if (pf == NULL) 
    {
        puts("Fail to open file!");
        exit(1);
    }
    char sLine[MAX_LINE_LENGTH];
    while(fgets(sLine, MAX_LINE_LENGTH, pf) != NULL) 
    {
        printf("%s", sLine);
    }
    // 关闭文件句柄
    fclose(pf);
    pf = NULL;
    return 0;
}
```

### 【规则3-11】零值比较规范

**检查方式**：代码走查
**说明**：必须采用如下说明的方式来进行，以方便代码的阅读，并防止可能发生的错误

1. 布尔变量与零值比较

   ```cpp
   if (flag)   // 表示flag 为真
   if (!flag)  // 表示flag 为假
   ```

2. 整型变量与零值比较

   ```cpp
   if (value == 0)
   if (value != 0)
   ```

3. 浮点变量与零值比较

   ```cpp
   if ((x>=-EPSINON) && (x<=EPSINON))    //其中EPSINON 是允许的误差（即精度）
   ```

   **典型例子**：

   现场资费为3700/60，用户账本余额-2035，刚好够使用量33s，算费结果也是扣2035，但是由于C++浮点数的误差，在系统中保存的可能是2035.0000000...1这样的值，向上取整就会变为2036，导致余额多扣1。
   对应代码为：

   ```cpp
   TRateLink::RoundCharing(...)
   {
       ...
       if (iAdjustMethod == CEIL) //向上取整
       {
           if (dOldFee >= 0) 
           {
               iNewFee = ceil(dOldFee);
           }
           else 
           {
               iNewFee = (-1) * ceil(ABS(dOldFee));
           }
        }
       ...
   }
   ```

   可见，针对浮点数，除了等号比较要考虑精度外，ceil(向上取整)、round(四舍五入)操作，也需要考虑精度。最终对ceil的操作，代码修改为：

   ```cpp
   if((ABS(dOldFee) - llong(ABS(dOldFee)) < 0.000001))
   {//浮点数在系统内存在一定误差，误差允许范围内直接认为调整前就是一个整数，不再向上取整
       ADD_DEBUG_("TRateLink::Ceil() COTE_CEIL_IGNORE_SYS_DEVIATION:dOldFee=[%lf],\n",dOldFee);
       iNewFee = llong(dOldFee);
   }
   else if (dOldFee >= 0) 
   {
       iNewFee = ceil(dOldFee);
   }
   else 
   { 
       iNewFee = (-1) * ceil(ABS(dOldFee));
   }
   ```

4. 指针变量与零值比较

   ```cpp
   /* c++中空指针比较：优先使用 nullptr 替代 NULL 或 0 表示空指针 */
   if (p == nullptr)
   if (p != nullptr)
   /* c中空指针比较 */
   if (p == NULL)  // p与NULL显式比较，强调p是指针变量
   if (p != NULL)
   ```

5. 字符变量与零值比较

   ```cpp
   if (c == '\0')   // 强调c为字符变量
   if (c != '\0')
   ```

### 【规则3-12】C++程序中只使用const常量，并避免使用"魔数"

**说明**：

1. **C++ 程序中避免使用宏常量**：因为`const` 常量有数据类型，而宏常量没有数据类型。编译器可以对前者进行类型安全检查。而对后者只进行字符替换，没有类型安全检查，并且在字符替换可能会产生意料不到的错误（边际效应）；有些集成化的调试工具可以对`const` 常量进行调试，但是不能对宏常量进行调试。
2. **消灭魔数**：代码中禁止直接使用无明确含义的字面量（如 `3.14`、`0x1F`）。
3. **增加注释**：符号常量需注释说明其含义、单位及取值范围。

**检查方式**：代码走查

**<font color=red>反例</font>**

```cpp
double dNumber = 3.1415926;
```

**正例**

```cpp
const double PI = 3.1415926; // PI值
double dNumber = PI; 
```

### 【规则3-13】构造函数中禁止调用本类的虚函数

**说明**：在构造函数中禁止调用本类或基类的虚函数，因为在对象构造期间，不能确定this指针所代表的对象，包括其中指向虚函数表的指针，有没有构造完成，即包括指向虚函数表的指针在内的所有成员有没有，完全构造完成，所以难以正常使用虚函数。
**检查方式**：代码走查

**<font color=red>反例</font>**

```cpp
class Test
{
    Test()
    {
    	TestForCodeRule();
    }

    virtual void TestForCodeRule()
    {
    	cout << "<< Test.TestForCodeRule this: " << this << " vtadr: " << *(void**)this << endl;
    }
};
```

### 【规则3-14】禁止使用goto语句

**说明**：不加限制地使用`goto`语句，特别是使用往回跳的`goto`语句，会使程序结构难于理解，在这种情形，应尽量避免使用`goto`语句。另外需要`goto`表达的语义，可以使用结构化控制流（如 `if`、`for`、`while`、函数封装、异常处理）实现逻辑。

**检查方式**：代码走查结合cppcheck工具检查处理

**<font color=red>反例</font>**

```cpp
int main(void){
    int iSum=0;
    int i = 0;
loop: 
    if(++i <= 100)
    {
        iSum += i;
        goto loop;
    }
    printf("%d\n",iSum);
    return 0;
}
```

**正例**

```cpp
int main()
{
	int iSum=0;
    int i = 0;
	while (++i <= 100)
	{
		iSum += i;
	}
    printf("%d\n",iSum);
    return 0;
}
```

### 【规则3-15】避免类型转换导致数据截断问题

**说明**：故障978824中将`double`类型的值强制转换为`int`类型的值，导致数据截断，并且符号位丢失成为负值。
因为类型转换数据截断导致的问题，最著名的案例就是阿丽亚娜5号火箭爆炸事故：1996年6月4日星期二，欧洲航天局计划首次发射新的阿丽亚娜（Ariane）5型火箭，它耗费了70亿美元和10年的研发时间，然而就在起飞后短短40秒后凌空爆炸。其根源就是一行代码尝试将64位浮点数转换成16位有符号整数，导致错误的数据结果被直接传递给主计算机，最终被主计算机解释为真实数据引起了灾难性后果。

**检查方式**：编译器检查

可以考虑在**AIX**主机加`-qinfo=trd`重新编译，会产生如下提示进行修改。

```shell
"a.c", line 5.3: 1506-452 (I) Assigning a floating-point type to an integral type may result in truncation.
# Gcc加-Wconversion编译时会产生告警。
cast.cpp:10: warning: conversion to ‘int’ from ‘double’ may alter its value
```

**标准化后的编译选项如下：**

- **aix**：`-qinfo=dcl:pro:ret:trd -qformat=all`
- **linux**：`-Wall -Wextra -Wformat=2 -Wconversion -Wsign-conversion -Wshadow`
  另外推荐增加`-Werror`编译项，以便杜绝编译告警：参考故障分析[UR:3791721](https://zmp.iwhalecloud.com/hppd/queryFauDtl.action?faultId=3791721)，因为编译告警未处理，在不同编译器下导致了应用异常。

**<font color=red>隐式转换告警修正要求：</font>**
1. 在消除编译器提示的警告时，<font color=red>不能简单的用无脑强制类型转换来消除编译警告</font>，而是要详细分析上下文代码去理解警告，<font color=red>优先通过修改变量类型的方式来消除警告</font>，避免隐式类型转换可能导致的数据被截断错误
2. 当方法1中的方式因为一些原因无法达成，并且<font color=red>确认不会存在数据截断问题时，才使用显式类型转换进行强转来消除编译警告</font>；同时<font color=red>需要增加注释说明，来明确此次修改信息</font>，注释至少需要包含：变量名、原始类型、结果类型、变量取值范围信息；另外变量源头也建议增加取值范围注释说明
   参考故障分析[UR:3408424](https://zmp.iwhalecloud.com/hppd/queryFauDtl.action?faultId=3408424)

**正例**

```cpp

int m_iSerialArraySize; //数组大小，实际取值范围100000
int iDesIndex = -1; //数组下标 
long lInSerialID； //业务流水 

... ...

// lInSerialID%m_iSerialArraySize: 由long转换为int，取值范围 < m_iSerialArraySize(100000)
iDesIndex = static_cast<int>(lInSerialID%m_iSerialArraySize);

```

### 【规则3-16】变量和函数遵守SRP原则

---

**说明**：这SRP（Single Responsibility Principle单一职责原则）在编程中具体应用。对于变量而言，每个变量只有一个用途。对于函数而言，每个函数只干一件事。当然，业务的主流程函数比较复杂，可能包含多个步骤，每个步骤分别由满足SRP的函数实现业务逻辑，并遵循单一抽象层次原则。<font color=red>**[UR：1089991](https://zmp.iwhalecloud.com/queryTransDtl.action?transid=1089991)**</font>
**检查方式**：代码走查

**<font color=red>反例</font>**

```cpp
int Func(int iFindId)
{
    int iRet = iFindId;
    iRet = UpdateInfo(iRet);
    if (iRet < 0)
    {
        ...
    }
    ...
    return iRet;
}
```

**正例**

```cpp
int Func(int iFindId)
{
    int iId = iFindId;
    int iRet = UpdateInfo(iId);
    if (iRet < 0)
    {
        ...
    }
    ...
    return iRet;
}
```

### 【规则3-17】 全局变量在实现文件(CPP/C)中定义

**说明**：

1. **实现文件定义**：在 `.cpp` 文件中定义全局变量，确保单一定义。
2. **头文件仅声明**：全局变量在头文件中用 `extern` 声明，从而避免因为多次包含而重复定义。
3. **优先替代方案**：用类的静态成员变量代替全局变量，增强封装性。

**检查方式**：代码走查

**<font color=red>反例</font>**

```cpp
// TestUtil.h
int g_iCallTimes;
```

**正例**

```cpp
// TestUtil.h
class TestUtil
{
...
public:
	static int GetCallTimes()
    {
        return m_iCallTimes;
    }
    static void IncrCallTImes()
    {
        m_iCallTimes++;
    }
private:
    static int m_iCallTimes;
}
```

### 【规则3-18】函数要遵守Clean Code原则

**说明**：例如计费Python接口函数，应该严格遵守Clean Code原则

1. 避免使用bool类型的函数参数，改为用两个意义更精确的函数替代；

   > **说明**：例如**gtest**为了方便使用通过`EXPECT_TRUE`/`EXPECT_FALSE`，用名字表达含义而不是参数取值来区分功能。

2. 避免使用缺省值参数，尽量利用编译器的能力检查提前暴露类似错误。

3. 函数模板中也避免使用默认模板参数来指定类型。

4. 建议函数参数不要超过3个

**案例**：<font color=red>**[UR：1977360](https://zmp.iwhalecloud.com/queryTransDtl.action?transid=1977360)**</font>函数调用使用错误参数导致业务处理错误，而且编译器没有报错？

1. 因为业务调用参数错位时导致bool向long转换，而从低精度向高精度转换，编译器不会报错也不会告警。如果不使用默认值参数，则函数调用参数个数少一个的情况编译器会报错。
2. 另外函数参数较多达到5个，开发人员肉眼未核对出来，所以自测也未覆盖到这种场景。

**注意：**避免使用缺省值参数，只是尽量通过编译器来发现错误的参数调用（参数缺少、参数类型不一致等情况），像两个类型相同的参数传入顺序错误时，编译器也发现不了问题。

**检查方式**：代码走查

**<font color=red>反例</font>**

```cpp
template <typename T = int>
void func(T param)
{
    // TODO:
}
int main()
{
    func<>(1);
}
```

**正例**

```cpp
template <typename T>
void func(T param)
{
    // TODO:
}
int main()
{
    func<long>(1);
}
```

### 【规则3-19】 避免使用返回静态数组方式来提高效率

**说明**：按照Effective C++条款29，将所有返回静态数组的函数改成参数传入数组赋值
**检查方式**：代码走查

**<font color=red>反例</font>**

```cpp
// TimeToString使用静态数组返回时间串。日志中利用该函数同时输出生效失效时间，打印为同一值
const char *TimeToString(time_t tTime)
```

**正例**

```cpp
// GetCurrentTimeStr获取当前时间字符串。通过外部传入数组变量存储时间字符串，避免内部使用静态数组
const char * GetCurrentTimeStr(char sTime[],size_t iLen)
```

### 【规则3-20】 避免对const指针对象进行转换修改

**说明**：const本身就是限制修改，转换修改可能违背原来的原则，可能导致错误
**检查方式**：代码走查

**<font color=red>反例</font>**

```cpp
time_t TDateTimeFunc::AddMonths(time_t iTime, long iMonths)
{
    char* sTime = (char*)TimeToString(iTime);
    AddMonths(sTime, iMonths);
    return StringToTime(sTime);
}
```

**正例**

```cpp
time_t TDateTimeFunc::AddMonths(time_t iTime, long iMonths)
{
    char sTime[DATE_TIME_SIZE];
    memccpy(sTime, TimeToString(iTime), 0, DATE_TIME_SIZE-1);
    sTime[DATE_TIME_SIZE-1] = '\0';
    AddMonths(sTime, iMonths);
    return StringToTime(sTime);
}
```

### 【规则3-21】避免使用编译器定义有差异的数据类型

**说明**：**AIX**是大端序，Linux是小端序；`char` 在AIX系统中默认是 `unsigned char`，而在**Linux**中 默认是有符号的`signed char`。**AIX**下`char`默认是无符号类型 `unsigned char`的，存储范围是`0` ~ `255`，**Linux**下是`signed char` 范围是`-128`~`127`，导致了数据保存的差异，产生负值。
**检查方式**：代码走查

**正例**：

1. 避免使用`char`，使用`unsigned char`或`signed char`

   ```cpp
   unsigned char tmpValue[24] = { 0 }; 
   ```

2. 利用编译选项指定类型

   > **Linux**这边可以用**gcc**的编译开关规避：`-funsigned-char`

### 【规则3-22】lambda 表达式使用规范

**检查方式**：代码走查

1. 禁止使用`mutable`函数选项：对于值捕捉的变量，即使在lambda中修改了变量，对外部也没有什么意义，如果想修改，直接使用引用捕捉
2. 变量捕捉禁止使用`[=]`：即不允许使用全部值捕捉，如果要进行值捕捉时，必须指定具体变量；因为全部值捕捉，可能引发无谓的临时对象拷贝

**<font color=red>反例</font>**

```cpp
int main()
{
	int x = 1;
	int y = 2;
	// 值捕捉全部变量
	auto swap = [=]()mutable ->void
		{
			auto tmp = x;
			x = y;   // 修改了内部的临时变量x
			y = tmp; // 修改了内部的临时变量y
		};
 
	swap(); // 外部x、y变量值并未改变
	// TODO:
}
```

**正例**

```cpp
int main()
{
	int x = 1;
	int y = 2;
	// 引用捕捉指定变量
	auto swap = [&x,&y]()->void
		{
			auto tmp = x;
			x = y;
			y = tmp;
		};
 
	swap(); // 外部x、y变量值已交换
	// TODO:
}
```

### 【建议3-1】避免或少用全局变量和局部静态变量

**说明**：过多地使用全局变量，会导致模块间的紧耦合，违反模块化的要求。同时对于多线程并发情况，全局变量和静态变量有可能存在不安全因素。

### 【建议3-2】类之间要独立，尽量不能有逻辑上的依赖

**说明**：类与类之间的关系越密切，耦合度越大，当一个类发生改变时，对另一个类的影响也越大。迪米特法则的核心观念就是类间解耦，弱耦合，只有弱耦合了以后，类的复用性才可以提高。

### 【建议3-3】尽量不要使用内联函数

**说明**：只有在经过性能测试证明内联函数可以显著提高性能时才进行内联。因为目前的编译器通常对这块的内容都有优化，可以自动根据代码的情况判断是否将一个函数设置成内联。因此，在一般情况下直接利用编译器完成此项工作即可。

### 【建议3-4】优先使用C++中的4种不同的类型转换

**说明**：C++提供的转换有对类型进行安全检查（包括`static_cast`，`dynamic_cast`，`const_cast`，`reinterpret_cast`），从而避免使用强制类型转换失败后程序的core的情况。

**举例如下**：

```cpp
class A
{
public:
	virtual void fun();
    …
};

class B : public A
{
private:
	bool m_bBFlag;
};

class C : public A
{
private:
	bool m_bCFlag;
};
A* a = new B();
A* a = new C();
```

**<font color=red>反例</font>**

```cpp
B* b = (B*)a;  
// 这个时候，如果a的值为class C，那么任对class B中的操作将导致程序发生 core
//  b->m_bBFlag = true;  
// …core 
```

**正例**：

```cpp
B* b;
if ((b = dynamic_cast<B* > a) == NULL)
{
// 这个时候，如果a的值为class C,将进入这个分支,以进行相应的错误处理
}

// 以上编程方法为预防性编程，防止数据错误时导致程序core的发生，以提高程序的健壮性。
```

### 【建议3-5】优先使用初始化列表方式编写构造函数

**说明**：初始化列表方式，可以一次性在成员构造时完成赋值，而不是通过二次赋值，这样可以提高效率。

**<font color=red>反例</font>**

```cpp
class Student
{
public:
    Student(const String strName, int iAge, float fScore)
    {
        m_strName = strName;
        m_iAge = iAge;
        m_fScore = fScore;
        ...
    }
    ...
private:
    string m_strName;
    int m_iAge;
    float m_fScore;
};
```

**正例**

```cpp
class Student
{
public:
    Student(const String strName, int iAge, float fScore):m_strName(strName),m_iAge(iAge),m_fScore(fScore)
    {
        ...
    }
    ...
private:
    string m_strName;
    int m_iAge;
    float m_fScore;
};
```

### 【建议3-6】类的数据成员的初始化应该尽量依赖构造函数来完成

**说明**：在面向对象程序中，memset应该尽量少出现，不必要的memset会引起性能的下降，另外类的数据成员在构造函数中进行初始化，以免引起使用未初始化的数据成员而造成意想不到的错误。

**<font color=red>反例</font>**

```cpp
class Test
{
public:
    Test()
    {
        memset(m_sMsg, 0, sizeof(m_sMsg));
        ...
    }
    ...
private:
    char m_sMsg[MAX_MESSAGE_LEN];
};
```

**正例**

```cpp
class Test
{
public:
    Test()
    {
        m_sMsg[0] = '\0';
        ...
    }
    ...
private:
    char m_sMsg[MAX_MESSAGE_LEN];
};
```

### 【建议3-7】数据类型的类要求提供清理函数

**说明**：数据类型的类提供了统一的清理函数（如`Clear()`方法），这样就方便外部使用，提高了代码重用性。

### 【建议3-8】派生类重写基类的虚函数时使用override关键字

**说明**：派生类中重写基类的虚函数时，在派生类的虚函数声明处需要添加`override`关键字，来保证与父类的虚函数声明一致。如果不一致则会编译报错，从而避免开发者在重写基类函数时无意产生的错误。

**备注**：
1. 在派生类中重写基类的虚函数，如果重写函数没有添加`override`关键字，在函数名称或参数名称书写错误的情况下，编译时会创建一个新的虚函数，编译不报错；但是运行时不能正确的实现动态多态，且在代码量大时很难定位，难以察觉。
2. 基类与派生类的析构函数都应该为虚函数，同样适配该要求

**<font color=red>反例</font>**

```cpp
class Person
{
    // TODO：
    virtual void func(int i);
};

class Student : public Person
{
    // TODO：
    virtual void func(long l); // 想要重写基类Person中func，但因为参数不同，实际创建了新的接口
};
```

**正例**

```cpp
class Person
{
    // TODO：
    virtual void func(int i);
};

class Student : public Person
{
    // TODO：
    // void func(long l) override; // 编译错误，因为基类Person中无对应的虚接口
    void func(int i) override; // 重写基类Person中的func；使用override后，可以省略virtual关键字
};
```

## 内存、异常机制、可靠性

### 【规则4-1】非内置类型的全局变量应使用指针方式

---

**说明**：非内置类型的全局变量会在启动时创建，即使没有使用到也会占用对应的内存。通常情况下，在构造函数时进行申请，在析构函数时进行释放。

**检查方式**：代码走查

### 【规则4-2】必须对动态申请的内存做有效性管理

**说明**： 内存分配原则，哪里分配的哪里释放

1. **分配后必检有效性**：动态内存分配后必须检查指针是否为空。
2. **初始化内存**：对分配的内存进行初始化（如 `memset` 或值初始化）。
3. **成对释放**：确保每次 `new` 都有对应的 `delete`，避免内存泄漏。
4. **置空指针**：释放内存后立即将指针置为 `nullptr`/`NULL`，防止野指针误用。

**检查方式**：代码走查

**<font color=red>反例</font>**

```cpp
for (int i = 0; i < n; i++)
{
	delete p[i];
}
```

**正例**

```cpp
for (int i = 0; i < n; i++)
{
	delete p[i];
	p[i] = NULL;
}
delete p;
p = NULL;
```

### 【规则4-3】变量在使用前必须初始化

**说明**：变量定义时就应该初始化，防止对未初始化变量的使用，带来不可以预料的问题。
**检查方式**：代码走查结合编译器告警检查处理

**<font color=red>反例</font>**

```cpp
int iRet;
if (...)
{
    iRet = Func();
}
if (iRet == RET_ERROR)
{
    ...
}
```

**正例**

```cpp
int iRet = RET_ERROR;
if (...)
{
    iRet = Func();
}
if (iRet == RET_ERROR)
{
    ...
}
```

### 【规则4-4】变量赋值时必须对其值进行合法性检查

**说明**：特别对于数组的赋值，进行合法性检查，可以防止内存越界写入（可能导致改写了其他内容）。
**检查方式**：代码走查

**<font color=red>反例</font>**

```cpp
int ResetCounter(int iSeq)
{
    m_aiCounter[iSeq] = 0;
    return RET_OK;
}
```

**正例**

```cpp
int ResetCounter(int iSeq)
{
    if (iSeq < 0 || iSeq >= MAX_COUNTER_NUM)
    {
        return RET_ERROR;
    }
    m_aiCounter[iSeq] = 0;
    return RET_OK;
}
```

### 【规则4-5】指针不要进行复杂的逻辑或算术运算

**说明**：对于类及函数外部设置或传入的指针变量，使用前需进行非空判断，防止程序core，并根据代码或业务需要，记录出错日志。典型的，如TRatableEvent类中的成员指针，很多都不是在类内部分配和维护的，仅仅是中间指针。某些异常业务逻辑时，可能不会被正确赋值，而使用前如果未对相关指针非空判断，则很容易引起程序core。
**检查方式**：代码走查

**<font color=red>反例</font>**

```cpp
int Func(TObject *pObj)
{
    pObj->Init();
    ...
}
```

**正例**

```cpp
int Func(TObject *pObj)
{
    if (pObj == NULL)
    {
        ...
        return RET_ERROR;
    }
    pObj->Init();
    ...
}
```

### 【规则4-6】非QMDB等例外模块外的代码中禁止抛出异常

**说明**：只有在`ORACLE`、`TT`、`QMDB`、`ZMQ`等接口代码中才允许使用throw关键字抛出异常，因此在调用这些接口的地方要对异常进行捕获（`try...catch...`）
**检查方式**：代码走查结合cppcheck工具检查处理

以下**反例**中介绍了几种不良的编码风格导致内存不能正常释放，从而引起内存泄露：

**<font color=red>反例</font>**

- 在`try…catch(…)`中进行内存申请释放，由于异常的发生，导致内存得不到正确的释放。

  ```cpp
  try
  {
  	int* p = new int[10];
  	...            //这个时候如果发生异常，程序跳转到异常处理，将导致内存泄露
  	delete [] p;
  }
  catch(…)
  ```

- 在函数执行的过程中有返回，导到内存不能正常释放，引起内存泄露

  ```cpp
  void fun(…)
  {
  	int* p = new int[10];
  	…   
  
      if (…)
      {
          return;       //这个时候如果条件满足，将导致内存泄露
      }
      …
  	delete [] p;
  
  	return;
  }
  ```

- 任意使用throw抛出异常，如果没有异常捕获的机制，程序会发生跳转，很可能造成内存泄露，或者资源没有正常释放。因此应该避免使用异常抛出

  ```cpp
  void fun(…)
  {
      if (…)//可能检查参数, 发现参数无效
      {
      	throw("…");  // 程序跳转到捕获异常的地方
      }
  }
  // 可能程序的原作者并没有犯错，但后面的人在增加新代码的时候并没有注意到前后逻辑，而导致上面提到的问题。因此在这里特别提出来，供大家在日常开发过程中进行参考，以避免此类情况的发生。
  ```

### 【规则4-7】构造函数应只完成简单有效的功能

**说明**：构造函数不应完成复杂的运算和大量的内存管理，以防止抛出异常时无法及时对其进行捕获处理，对于复杂的初始化工作应该放到类似`Initialize()`函数中去。
**检查方式**：代码走查

**<font color=red>反例</font>**

```cpp
TRatingCtrlEngineIN::TRatingCtrlEngineIN(TappConfig DBConfig,TAppConfig OdbcConfig) : TRatingCtrlEngineBase(DBConfig,OdbcConfig)
{
    m_pInsertAocAcm= new TRtOdbcDBQuery(TRtODBCFactory::GetRoutingDataBase(gpOdbcDBLink));
    m_pInsertAocAcm->Close();
    m_pInsertAocAcm->SetSQL(INSERT_SUBS_AOC_ACM_SQL);
}
```

**正例**

```cpp
TRatingCtrlEngineIN::TRatingCtrlEngineIN(TAppConfig DBConfig,TAppConfig OdbcConfig) : TRatingCtrlEngineBase(DBConfig,OdbcConfig)
{
}

//增加一个初始化函数来进行内存操作以及数据库操作
TRatingCtrlEngineIN::Init()
{
	bool bReFlag = TRatingCtrlEngineBase::Initialize();
  	m_pInsertAocAcm= new (nothrow) TRtOdbcDBQuery(TRtODBCFactory::GetRoutingDataBase(gpOdbcDBLink));
    if (NULL == m_pInsertAocAcm)
    {
        return -1;
    }
    m_pInsertAocAcm->Close();
    m_pInsertAocAcm->SetSQL(INSERT_SUBS_AOC_ACM_SQL);
    ……
	return bReFlag;
}
```

### 【规则4-8】禁止构造函数中抛出异常

**说明**：在构造函数中抛出异常将中止对象的构造，这将产生一个没有被完整构造的对象，从而有可能导致申请的内存没有正确释放。

对于C++来说，这种不完整的对象将被视为尚未完成创建动作而不被认可，也意味着其析构函数永远不会被调用。这个行为本身无可非议，就好像公安局不会为一个被流产的婴儿发户口然后再开个死亡证明书一样。

**建议**：可能失败的逻辑，最好放在Init函数中。
**检查方式**：代码走查

**<font color=red>反例</font>**

```cpp
class Test
{
public:
    Test()
    {
        m_pStudent = new Student();
    }
    ...
private:
    Student *m_pStudent;
    ...
}
```

**正例**

```cpp
class Test
{
public:
    Test()
    {
        m_pStudent = NULL;
    }
    int Init()
    {
        m_pStudent = new Student();
        ...
    }
    ...
private:
    Student *m_pStudent;
    ...
}
```

### 【规则4-9】禁止析构函数抛出异常

**说明**：析构函数中的异常可能在2种情况下被抛出

1. 对象被正常析构时
2. 在一个异常被抛出后的退栈过程中——异常处理机制退出一个作用域，其中所有对象的析构函数都将被调用。

**由于C++不支持异常的异常，上述第二种情况将导致一个致命错误，并使程序中止执行。**

**建议**：如果调用的函数可能有异常，那么需要在析构函数中，自己先try catch,不要往外层抛出。
**检查方式**：代码走查

**<font color=red>反例</font>**

```cpp
// 这个class用来管理DBConnection对象
class DBConn
{
public:
    ...
    // 供客户使用的新函数
    void close()
    {
        if(!closed)
        {
            db.close();
        	closed = true;
        }
    }
    // 确保数据库连接总是会被关闭
    ~DBConn()
    {
        close();
    }
private:
    DBConnection db;
    bool closed;
};
```

**正例**

```cpp
class DBConn
{
public:
    ...
    // 供客户使用的新函数
    void close()
    {
        if(!closed)
        {
            db.close();
        	closed = true;
        }
    }
    ~DBConn()
    {   // 关闭连接（如果客户不那么做的话）
        try
        {
            close();
        }
        catch(...)
        {   // 如果关闭动作失败，记录下来并结束程序或吞下异常
            ...
        }
    }
private:
    DBConnection db;
    bool closed;
};
```

### 【规则4-10】每一个new都必须有一个对应的delete

**说明**：

在 C++ 标准（ISO/IEC 14882:2003）第 15.2 节中明确规定，在使用 `new` 或 `new[]` 操作创建对象时，如对象的构造函数抛出了异常，则该对象的所有成员和基类都将被正确析构，如果存在一个与使用的 `operator new` 严格匹配的 `operator delete`，则为这个对象所分配的内存也会被释放。

如果析构函数可能抛出异常，那么在`delete`对象时，需要加`try catch`,若是捕捉到异常，则要再调用`operator delete`释放对象本身的内存。

**检查方式**：代码走查

**正例**

```cpp
CSample* p1 = new CSample;
try
{
    delete p1;
}
catch(const sampleExp& err)
{
    CSample::operator delete(p1); // 释放 p1 所占用的内存
    // 使用 err 对象完成后续的错误处理...
}
// 目前我们禁止在析构函数中抛出异常，则new对象的内存可以被正确的释放，无需使用try catch来捕获delete异常。
```

### 【规则4-11】异常捕获器的书写顺序应当由特殊到一般

**说明**：异常捕获器的书写顺序应当由特殊到一般（先子类后基类），最后才是处理所有异常的捕获器（catch(\...)）。否则将使某些异常捕获器永远不会被执行

**检查方式**：代码走查

**<font color=red>反例</font>**

```cpp
try
{
    //代码段...
}
catch(const TException& e) //异常基类
{ 
    ...
}
catch (const TDBException &oe)//数据库异常-特殊异常
{ 
    ...
} 
```

**正例**

```cpp
try
{
    //代码段...
}
catch (const TDBException &oe)//数据库异常-特殊异常
{ 
    iRet = BS_DATABASE_EXCEPTION; 
    gpBillLog->Warning(WARNING_FATAL,iRet,__WHEREFORMAT__ "exception msg = %s,sql = %s.\n",__WHERE__,oe.GetErrMsg(),oe.GetErrSql()); 
} 
catch(const TException& e) //异常基类
{ 
    iRet = BS_APP_EXCEPTION; 
    gpBillLog->Warning(WARNING_FATAL,iRet,__WHEREFORMAT__ "exception msg = %s.\n",__WHERE__,e.GetErrMsg()); 
}
catch(...) 
{ 
    iRet = BS_UNKOWN_ERROR; 
    gpBillLog->Warning(WARNING_FATAL,iRet,__WHEREFORMAT__ "unkown exception.\n",__WHERE__); 
}

```

### 【规则4-12】异常捕获器中的参数类型应当为常引用型或指针型

**说明**：具体需要根据throw时参数类型是对象本身还是指针，来确定异常捕获时使用对应类型，避免捕获到的异常被截断。new出的异常对象是堆中构造，需要做相应的delete操作，以正确的释放内存。
**检查方式**：代码走查

**<font color=red>反例</font>**

```cpp
try
{
    throw TException("error");
}
catch(const TException e)
{
}
```

**正例**

- 常引用型

  ```cpp
  try
  {
      throw TException("error");
  }
  catch(const TException& e)
  {
  }
  ```

- 指针型

  ```cpp
  try
  {
      throw new TException("error");
  }
  catch(TException* e)
  {
      delete e;
  	e = NULL;
  }
  ```

### 【规则4-13】禁止使用strcpy/sprintf/vsprintf等不安全操作函数

**说明：**为防止内存操作越界，禁止使用strcpy/sprintf/vsprintf等不安全操作函数，而是使用memccpy, snprintf,vsnprintf函数，同时禁止自拷贝(源和目的地址相同)

在C++中，除非性能要求苛刻，尽量使用**string**类型，而不要使用C风格的字符串，因为**string**类型占用内存空间是会自动扩展的，无需再关注底层的字符串实现细节。

`strcpy`和`sprintf`函数不带缓冲区长度，存在内存越界风险，改为更加安全的`memccpy`和`snprintf`可以有效避免内存越界的现象。

`strncpy`函数是安全的，但是当源字符串比目标字符串短的时候，`strncpy`会用0来填充不足的部分，导致性能下降。而`memccpy`函数则会遇到指定的字符就停止拷贝，并且指定字符也会拷贝到目标缓冲区中。不过在使用`memccpy`时仍然要像使用`strncpy`函数时一样在缓冲区末尾增加结束符，避免内存越界访问。

`snprintf`的源和目的地址是同一个变量时，在某些平台如**linux**下会导致非预期结果，可以通过增加一个中间变量来实现。如果纯粹是为了字符串拼接，建议使用**string**类型来拼接最终结果。

**检查方式**：代码走查结合cppcheck工具检查处理

**<font color=red>反例</font>**

```cpp
// 使用strcpy进行字符串拷贝
strcpy(sDest, sSrc);
// 使用snprintf进行字符串处理，源和目的地址相同
snprintf(sDest, MAX_CONTENT_LEN, "%s%s", sDest, sSrc);
```

**正例**

```cpp
// 使用memccpy进行字符串拷贝
memccpy(sDest, sSrc, 0, MAX_CONTENT_LEN);
// 使用std::string进行字符串拼接
std::string strDest;
strDest.append(sSrc);
```

### 【规则4-14】对数组通过下标访问操作时必须进行内存越界检查

**说明**：对指定大小的数组（包括堆中分配的和栈中分配的）进行下标变化的操作时必须进行内存越界检查。数组下标变化时，存在内存越界风险，需要进行边界检查。需要注意的是，数组创建和下标访问检查时应该使用统一的宏定义，使用不同的宏定义或魔数，都容易出现两者不一致的情况，导致发生内存访问越界。
**检查方式**：代码走查

**<font color=red>反例</font>**

<font color=red>**[UR：2318868](https://zmp.iwhalecloud.com/queryFauDtl.action?faultId=2318868)**</font> 因为数组创建和赋值检查时未使用统一的宏定义，导致内存访问越界

**正例**

```cpp
// 正确的使用方式如下,数组创建和数组下标访问检查时都使用统一的宏MAX_DMT_PASER_NUM：
#define MAX_DMT_PASER_NUM 10
TDiameterParserInfo * TDiameterTransForm::m_vDiameterParser = new TDiameterParserInfo[MAX_DMT_PASER_NUM];
TDiameterTransForm * TDiameterTransForm::GetInstance(int iPno) 
{ 
    for (int i = 0; i < MAX_DMT_PASER_NUM; i++) 
    { 
        m_vDiameterParser[i].iPno = -1;
        m_vDiameterParser[i].pDiameterTrans = NULL; 
    } 
}
```

### 【规则4-15】将数据库表数值类型主键对应的变量定义成long long类型

**说明：**

一般地，对于数据库表数值类型主键，流水表定义为`number(12)`，其他配置表为`number(9)`或`number(6)`。对于`number(9)`之上的必须定义为`long long`类型，对于`number(9)`及以下的，如果对空间占用要求严格，变量可以定义为`int`类型。

对于数据库表中其它的数值类型字段，也一样处理。

**检查方式**：代码走查

### 【规则4-16】程序实现应尽量避免采用递归的形式

**说明：**

程序的递归是通过调用栈实现的，当递归的次数过多时，会产生栈溢出，导致程序core。递归使用不当也将严重影响系统的性能。通常递归都是可以通过其它形式来实现的，递归写法代码简单，但理解起来复杂。代码的通俗易懂比起一些小技巧要来得重要。

极个别情况一定要用到递归时，实现的算法和代码应经过TA的审核：比如，使用递归的方式检索目录。递归算法易于理解也简单。

**检查方式**：代码走查

**<font color=red>反例</font>**

```cpp
// 斐波那契数列
int Fibon(int iId)
{
	if (iId > 2)
	{
		return Fibon(iId - 1) + Fibon(iId - 2);
	}
    else if (iId == 1 || iId == 2)
	{
		return 1;
	}
    else 
    {
        return 0;
    }
}
```

**正例**

```cpp
// 斐波那契数列
int Fibon(int iId)
{
    int iA = 0;
    int iB = 1;
    int iTmp = 0;
    for (int i = 0; i < iId; i++)
    {
        iTmp = iA;
        iA = iB;
        iB += iTMp;
    }
    return iA;
}
```

### 【规则4-17】检查所有来源于外部数据的值和子程序所有输入参数的值

**说明：**需要检查所有来源于外部数据的值和子程序所有输入参数的值，以保护程序免遭非法输入数据的破坏。

《代码大全2》中提到，防御式编程的主要思想是：子程序应该不被传入错误的数据而被破坏，哪怕是由其他子程序产生的错误数据。需要将“垃圾进，垃圾出”缺乏安全性的差劲程序做到“垃圾进，什么都不出”、“进来垃圾，出去时出错提示”或者“不许垃圾进来”。对已形成产品的软件而言：不管进来的数据如何，都不应该产生垃圾数据。

**通常处理垃圾方法：**

对于非法输入数据，至少选择如下一种处理方法，其中当非法输入会导致程序后续无法正常运行时，必须关闭程序。

1. **检查所有来源于外部数据的值**。当从文件、用户、网络或其他外部接口中获取数据时（不限于配置文件、数据文件、网络消息、数据库等外部输入场景），应检查所获得的数据值，严格按照契约进行校验以确保它在允许的范围内。例如整型是不是在可接受范围内，字符串是不是合乎用途，包括企图令缓冲溢出的数据、注入的SQL命令、注入的HTML或XML代码等等。

   **异常数据的建议合理处理方法：**

   - 可立即显示出错信息，把警告信息记录到日志文件中
   - 返回一个错误码。如果和外部有错误约定，就需要返回错误码和错误消息给外部
   - 可以正常处理下一个正确的数据
   - 或调用错误处理子程序或对象集中处理错误
   - 换用最接近的合法值。如果输入数据超出范围时，可以根据值修改为支持的最大值或者最小值。以提高交互的友好性
   - 关闭程序
2. **检查子程序所有输入参数的值**。例如命令行启动参数。

   **异常参数的建议合理处理方法：**

   - 立即显示出错信息，把警告信息记录到日志文件中或者界面上
   - 关闭程序
   - 修改最接近的合法值。如果输入参数超出范围时，可以根据值修改为支持的最大值或者最小值。以提高交互的友好性

**检查方式**：代码走查

**<font color=red>反例</font>**

<font color=red>**[故障单939670](https://zmp.iwhalecloud.com/queryFauDtl.action?faultId=939670)**</font> 后台程序收到了一个CCR，在解析和拷贝到自定义的结构体中时未做长度判断，导致溢出，覆盖了静态变量区的部分静态变量，这几个变量是用于过载保护的，所以启用过载保护功能时引发大面积的3004错误。

**正例**

```cpp
int Func(int iParam)
{
    if (iParam < 0 || iParam > MAX_PARAM_VALUE)
    {
        // 记录错误日志
        LOGWARN(...);
        // 返回错误码
        return ERR_INVALID_VALUE;
    }
    ... 
}
```

### 【规则4-18】一些故障总结经验作为基本准则

**检查方式**：代码走查

**说明：**

1. 需要考虑if/else每个分支逻辑的完备性，即使else分支没逻辑也需要把逻辑用注释写上。参考[UR:620982](https://zmp.iwhalecloud.com/queryTransDtl.action?transid=620982)
2. 所有有缓存的查询结果必须立即使用或保存下来使用。禁止用一个指针指向缓存，因为其他地方也可能使用这个查询方法无意中修改了缓存，导致出错，样例参考[UR:988161](https://zmp.iwhalecloud.com/queryTransDtl.action?transid=988161)
3. 避免如下常见core问题：
   - 指针不判断NULL直接使用导致的故障
   - 除数不判断0导致的故障
   - 内存越界：`char path[256]; memset(path,1,1024);`
   - 内存读访问越界：动态分配的堆内存读访问越界同样是未定义行为，需要严格在内存申请的范围内进行读写访问。例如使用`void *memcpy(void *dest, const void *src, size_t n)`进行数据复制时，需要确保`dest`和`src`指针对象的大小都要大于等于`n`；`memccpy`、`strncpy`等函数同样存在类似的使用要求。
     参考故障分析[UR:3466219](https://zmp.iwhalecloud.com/hppd/queryTransDtl.action?transid=3466219)
   - 新增程序外层没处理抛出的异常
4. 避免一些常见错误
   - 没考虑属性空时，`GetAttrEx()->AsInteger()`返回0的场景
   - 没有考虑`GetAttr` 返回NULL：`GetAttr()->AsInteger()`，会导致core
   - 大于2的31次方的误定义成`int`类型，特别是：钱/使用量/用户ID/账户ID等
   - 避免用一个保留属性组合保存过多信息，导致截断。属性值长度不能超过255个字节。反例[UR:1012589](https://zmp.iwhalecloud.com/queryTransDtl.action?transid=1012589)
   - Session.ExtAttr可能超长，引起截断时，需设置返回码为5031。该字段读取解析的地方，注意完整性校验。否则可能导致core。[UR:1090602](https://zmp.iwhalecloud.com/queryTransDtl.action?transid=1090602)
5. 性能方面的问题，值得注意：
   - 1000以上大字符串，复制使用`memccpy`代替`strncpy`，初始化、复位使用首字符设置`\0`的方式
   - 判断字符串是否有值使用首字符代替strlen
   - 结合业务场景尽量减少数据库包括qmdb的访问，参考[UR:1015527](https://zmp.iwhalecloud.com/queryTransDtl.action?transid=1015527)
   - 一些基本方法优先使用标准库的，例如:`CompareStrNoCase` 不及标准库`strcasecmp`性能

### 【规则4-19】创建线程时调用接口来指定线程栈大小

**说明**：创建线程时，需要实际需求确定栈大小，并调用接口指定线程栈大小，避免依赖平台操作系统设置而造成移植问题

**检查方式**：代码走查

参考故障分析[UR:1096558](https://zmp.iwhalecloud.com/queryFauDtl.action?faultId=1096558)

**<font color=red>反例</font>**

```cpp
pthread_t tTid;
int iRet = pthread_create(&tTid, NULL, pThreadFunc, NULL);
if (iRet != 0)
{
    printf("can't create thread: %s\n" ,  strerror(iRet));
    return iRet;
}
...
```

**正例**

```cpp
pthread_attr_t tAttr;
pthread_attr_init(&tAttr);
pthread_attr_setstacksize(&tAttr, MYAPP_THREAD_STACK_SIZE);

pthread_t tTid;
int iRet = pthread_create(&tTid, &tAttr, pThreadFunc, NULL);
if (iRet != 0)
{
    printf("can't create thread: %s\n" ,  strerror(iRet));
    pthread_attr_destroy(&tAttr);
    return iRet;
}
...
```

### 【规则4-20】多线程访问共享资源时需要加锁保护

**说明**：多线程并行访问共享资源时，需要加锁保护，避免并发更新访问，导致数据错乱等问题

1. 锁的职责要单一，尽量减少锁的使用范围：从而避免锁冲突引起性能问题，也能有效避免死锁
2. 尽量避免嵌套加锁：如果必须嵌套加锁，务必保证不同地方的加锁顺序是一样的来避免死锁
3. 尽量使用基于RAII设计理念的锁，例如`std::lock_guard`、`std::unique_lock`：将互斥锁的作用范围和（对象）作用域绑定，函数退出作用域后，自动释放锁资源

[UR:3599745](https://zmp.iwhalecloud.com/hppd/queryFauDtl.action?faultId=3599745)：5G线程多线程处理有bug，多线程处理时，通讯总控线程释放链路资源时未加锁，导致接受线程有一定概率会重复释放同一资源，释放一个已经被释放的进程，从而程序core。

**检查方式**：代码走查

**<font color=red>反例</font>**

```cpp
class Widget
{
public:
    ... ...
    void fun()
    {
        try 
        {
            m_mutex.lock();
            // TODO: 资源访问处理
            
            m_mutex.unlock();
        } 
        catch (...) 
        {
            // TODO: 异常处理
        }
    }
private:
    std::mutex m_mutex;
};
```

**正例**

```cpp
class Widget
{
public:
    ... ...
    void fun()
    {
        try 
        {
            std::lock_guard<std::mutex> lock(m_mutex);
            // TODO: 资源访问处理
        } 
        catch (...) 
        {
            // TODO: 异常处理
        }
    }
private:
    std::mutex m_mutex;
};
```

### 【建议4-1】合理使用assert或等价物来检查非法情况

**说明：**

《C++编程规范——101条规则、准则与最佳实践》中第68条：广泛地使用断言记录内部假设和不变式，建议大家广泛的使用断言。

**需要注意**，不能用断言来检查最终产品肯定会出现且必须处理的错误情况。断言是用来处理不应该发生的错误情况的，对于可能会发生的且必须处理的情况要写防错程序，而不是断言。如某模块收到其它模块或链路上的消息后，要对消息的合理性进行检查，此过程为正常的错误检查，不能用断言来实现。

**<font color=red>反例</font>**

```cpp
// 打开文件失败是正常的错误检查，不应使用断言，而应该使用if (pf == NULL) 检查，并进行错误信息记录
FILE *pf = fopen("demo.txt", "r");
assert(pf != NULL)
...
```

**正例**

```cpp
// 对于内部流程处理，内部对象的type是一定的，可使用断言处理：如果类型不对，说明内部流程流转存在故障，甚至发生了内存溢出
int ProcessFlow(TObject &tObj)
{
    assert(tObj.type == XXX)
}
```

### 【建议4-2】使用智能指针来进行指针对象的自动释放管理

1. c++11后禁止使用`std::auto_ptr`智能指针，而应使用`std::unique_ptr`智能指针进行替代：因为`std::auto_ptr`有拷贝语义，并且拷贝后原对象变得无效，再次访问原对象时会导致程序崩溃；而`std::unique_ptr`不允许拷贝，只能`move`转移
2. 如果程序要使用多个指向同一个对象的指针，应选择`std::shared_ptr`智能指针，例如：
   - 将指针作为参数进行传递：参数值传递会产生拷贝
   - 两个对象都包含指向第三个对象的指针
   - STL容器元素中包含指针：对STL容器的操作可能会进行元素的拷贝、赋值
3. 如果程序不需要多个指向同一个对象的指针，则可使用`std::unique_ptr`智能指针
4. 尽量使⽤`make_shared`来创建`std::shared_ptr`智能指针：避免使用`new`，因为我们也不会使用`delete`来删除指针；另外也能降低对裸指针的直接使用，避免误用
5. 尽量使用`make_unique`来创建`std::unique_ptr`智能指针：避免使用`new`，因为我们也不会使用`delete`来删除指针；另外也能降低对裸指针的直接使用，避免误用
6. 尽量不要使用`move`来转移`std::unique_ptr`智能指针：因为后面再访问原智能指针时会导致异常
7. 禁止使用`delete`来释放被智能指针管理的裸指针：会造成原智能指针的使用异常
8. 禁止使用⼀个裸指针初始化多个智能指针：同样会造成智能指针的使用异常

**<font color=red>反例</font>**

```cpp
shared_ptr<int> sp1(new int(100)); // 使用new初始化智能指针
int *p = sp.get();
shared_ptr<int> sp2(p);  // 使用一个裸指针(p)，初始化了多个智能指针(sp1、sp2)
delete p;  // 使用delete释放被智能指针管理的裸指针
```

**正例**

```cpp
shared_ptr<int> sp1 = make_shared<int>(100);
shared_ptr<int> sp2(sp1);
```

### 【建议4-3】C++中空指针建议使用nullptr

**说明**：在 c++中如果表示空指针语义时建议使⽤ `nullptr` ⽽不要使⽤`NULL`，因为`NULL`在C++中本质上是个 int 型的`0`，所以`NULL`代替空指针在C++中存在二义性。

[UR:3558542](https://zmp.iwhalecloud.com/hppd/queryFauDtl.action?faultId=3558542)：业务代码误将指针设置为`0`，后续使用指针时触发程序core。使用`nullptr`后，方便使用`-Wzero-as-null-pointer-constant`编译选项，来检查指针变量被误设置为0：[gcc使用-Wzero-as-null-pointer-constant编译选项时，NULL指针告警误报情况验证](https://docs.iwhalecloud.com/bidcjxWpK/share?d=1kox#/didD19CotN?single=true&head=false)

**<font color=red>反例</font>**

```cpp
void fun(int);
void fun(char*);
int main()
{
    fun(NULL); // 使用NULL作为空指针传入，存在二义性，不知道调用func(int) 还是func(char*)
    // TODO
}
```

**正例**

```cpp
void fun(int);
void fun(char*);
int main()
{
    fun(nullptr);  // 明确调用fun(char*)
    // TODO
}
```

## 性能

### 【建议5-1】尽量避免使用跨动态库的全局变量访问

**说明：**跨动态库的全局变量访问，会导致内存使用增加，性能下降

《程序员的自我修炼》中对于模块间的数据访问阐述是：跨动态库的全局变量的访问是通过全局偏移表（**Global Offset Table, GOT**），当代码需要引用该全局变量时，可以通过**GOT**中相对应的项间接引用，这会有性能损耗。另外对跨模块的全局变量修改，会触发动态库的全局数据的写时拷贝机制，而导致内存使用增加。而模块内的全局变量访问是使用相对地址直接访问。

而模块间的调用和跳转，则可以不使用**GOT**方式（简单但存在一些性能问题），而采用一种更加复杂和精巧的方法，详见《程序员的自我修炼》中的动态链接优化章节。

### 【建议5-2】尽量避免在循环中对全局变量/静态变量进行访问或者修改

**说明：**

因为全局变量存放在数据段,每次访问都会有一个从数据段读取的动作,相比而言局部变量有可能在栈中,也有可能在寄存器中,每次都需要先从数据段中读出该变量值,处理完成后在要写回数据段，效率相对较低。需要在循环中使用上述变量时,可以考虑先将其赋值给一个局部变量.局部变量有可能被编译器优化到寄存器中。

### 【建议5-3】尽量使用1维数组，使用2维数组时尽量保证列数为2的幂

![image](uploads/4081/583f3420-9aa8-4cb3-9ce1-b389d3e20a96/image-20210726202651695.png)

**<font color=red>反例</font>**

```cpp
int a[20][20];
```

**正例**

```cpp
int a[20][32];
```

### 【建议5-4】最有可能执行的语句放在if else结构前面

**示例**

```cpp
if (a == 1)
{
    // 最快
}
else if (a ==2 )
{
    // 中等
}
else
{
    // 最慢
}
```

### 【建议5-5】逻辑连接表达式中将概率较大的条件放在左边

**说明**：逻辑连接表达式，是从左到右对表达式计算的，将概率较大的条件放在左边有助于提高处理性能。

### 【建议5-6】尽量避免在性能要求较高的for语句中嵌套if语句

**说明**：当在`for`语句中嵌套`if`或者`switch`语句时，可能会导致CPU流水线的清空和转移等低效率事件的发生，可以将if语句提到循环外面来。

### 【建议5-7】文件操作时一次读取的buffer大小为2048\~8192字节效率较高

**说明**：避免一次读取字节数太小影响效率，太多又导致内存开销大。

### 【建议5-8】对大文件操作时使用mmap

**说明：**使用`mmap`将文件映射到内存，可以提高效率，但是需要注意文件太大会影响内存的占用率。

用`fread`/`fwrite`方式访问硬盘，用户须向内核指定要读多少，内核再把得到的内容从内核缓冲池拷向用户空间；写也须要有一个大致如此的过程。这样在访问**IO**的时候就多经历了这么一个内核的**buffer**，造成速度的限制。

`mmap`就是通过把文件的某一块内容直接映射到用户空间上，用户可以直接向内核缓冲池读写这一块内容，这样一来就少了内核与用户空间的来回拷贝所以通常更快。

### 【建议5-9】避免对自定义对象的反复创建和析构

**说明：**

大的自定义对象可能组合了不同类的对象，所以构造和析构函数会比较消耗内存和性能，

应避免对自定义对象的反复创建和析构。

### 【建议5-10】使用类的前向声明等机制来减少编译时间

**说明**：在头文件中如果仅仅使用了其他类的指针，则使用此类的前置声明，而不是包含类所在的头文件，这样编译包含此头文件的cpp文件时，会因为依赖减少而缩短了编译时间。

### 【建议5-11】优先调用前置形式的 ++ 和 \-- 操作符

**说明**：根据C++语法，前置递增效率更高，后置式递增要拷贝一个临时对象。

### 【建议5-12】去掉不必要的memset或者数组初始化操作

**说明**：对于大的数组不必要的`memset`会引起性能的下降，对于字符串数组的初始化可以用首字符置0的方式，同时注意后续的字符串拷贝等操作要设置0结束符。另外`strncpy`函数当源字符串比目标字符串短的时候，`strncpy`会用0来填充不足的部分，导致性能下降，而`memccpy`函数则会遇到指定的字符就停止拷贝，不过在使用`memccpy`时要在缓冲区末尾增加结束符，避免内存越界访问。

### 【建议5-13】尽可能用TSChr类代替原生的C字符串解决性能问题

**正例**

```cpp
TSChr sSessionId(SESSION_ID_SIZE);
sSessionId << pRatableEvent.GetAttrEx(EA::SESSION_ID)->AsString();
sSessionId << ';' << pRatableEvent.GetAttrEx(EA::RATING_GROUP)->AsInteger() << ';' << pRatableEvent.GetAttrEx(EA::SERVICE_IDENTIFIER)->AsInteger();
```

# 结语

本规范是针对C++语言的编程规则，结合CCB计费后台程序的传统结构和编程风格给出的指导性文件。在本规范中提供的【规则】条目，请读者严格遵守。本文档用于提高CCB源代码的可读性、可靠性和可重用性，提高代码的质量和可维护性，减少软件维护成本，并可作为后续开发的规范参考。我司同事有责任对规范的可行性及扩展性提出自己的建设性意见。

