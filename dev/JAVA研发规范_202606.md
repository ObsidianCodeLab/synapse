# 前言

编码规范对于程序员而言尤为重要，有以下几个原因：

- 一个软件的生命周期中，80%的花费在于维护。
- 几乎没有任何一个软件，在其整个生命周期中，均由最初的开发人员来维护。
- 编码规范可以改善软件的可读性，可以让程序员尽快而彻底地理解新的代码。
- 编码规范可以促使程序员遵循最佳实践与设计模式，避免常见错误和潜在漏洞，从源头保障软件质量，提升产品可靠性。

## 适用对象

浩鲸科技 JAVA 开发人员

## 目的

为了持续、稳定地开发出高质量，健壮的软件系统，为了保证团队中成员的编码质量，特制定本文档。用于规范团队内部开发过程，增加程序的健壮性，便于后续测试及代码维护，最终提高软件产品的生产力。

## 申明

在本编码规范文档中，部分示例代码使用了类似`System.out.println`等语句用于展示代码逻辑和规范要点。需明确的是，在实际的 Java 开发场景下，这类语句并不符合本编码规范要求。它们仅作为示例辅助手段，用于突出规范所针对的特定代码问题，对表达规范的正反例具有直观展示作用，旨在帮助读者更清晰地理解规范要点。在实际项目开发中，请严格遵循本编码规范，避免使用此类不符合规范的语句，优先采用封装的`Logger`输出信息，以确保代码质量、可维护性和规范性。

# 编程惯例

## 集合处理

### 【J000000】强制：关于 hashCode 和 equals 的处理，只要覆写 equals，就必须覆写 hashCode

关于 hashCode 和 equals 的处理，应该遵循如下规则：

* 只要覆写 equals，就必须覆写 hashCode。
* 因为 Set 存储的是不重复的对象，依据 hashCode 和 equals 进行判断，所以 Set 存储的对象必须覆写这两个方法。
* 如果自定义对象作为 Map 的键，那么必须覆写 hashCode 和 equals。

**说明** ：String 已覆写 hashCode 和 equals 方法，所以我们可以愉快地使用 String 对象作为 key 来使用。

**正例：**

```java
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

class CustomUser {
    private String username;
    private int age;

    public CustomUser(String username, int age) {
        this.username = username;
        this.age = age;
    }

    // 覆写 equals 方法
    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        CustomUser that = (CustomUser) o;
        return age == that.age && username.equals(that.username);
    }

    // 覆写 hashCode 方法
    @Override
    public int hashCode() {
        int result = username.hashCode();
        result = 31 * result + age;
        return result;
    }
}

public class HashCodeEqualsExample {
    public static void main(String[] args) {
        CustomUser user1 = new CustomUser("Alice", 25);
        CustomUser user2 = new CustomUser("Alice", 25);

        // 使用 Set 存储自定义对象
        Set<CustomUser> userSet = new HashSet<>();
        userSet.add(user1);
        userSet.add(user2);
        System.out.println("Set 中的元素数量: " + userSet.size());  // 1

        // 使用自定义对象作为 Map 的键
        Map<CustomUser, String> userMap = new HashMap<>();
        userMap.put(user1, "User info");
        System.out.println("通过 user2 从 Map 中获取的值: " + userMap.get(user2));  // User info
    }
}
```

**反例：**

```java
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

class BadCustomUser {
    private String username;
    private int age;

    public BadCustomUser(String username, int age) {
        this.username = username;
        this.age = age;
    }

    // 仅覆写 equals 方法，未覆写 hashCode 方法
    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        BadCustomUser that = (BadCustomUser) o;
        return age == that.age && username.equals(that.username);
    }
}

public class BadHashCodeEqualsExample {
    public static void main(String[] args) {
        BadCustomUser user1 = new BadCustomUser("Bob", 30);
        BadCustomUser user2 = new BadCustomUser("Bob", 30);

        // 使用 Set 存储自定义对象
        Set<BadCustomUser> badUserSet = new HashSet<>();
        badUserSet.add(user1);
        badUserSet.add(user2);
        System.out.println("错误的 Set 元素数量: " + badUserSet.size());  // 2

        // 使用自定义对象作为 Map 的键
        Map<BadCustomUser, String> badUserMap = new HashMap<>();
        badUserMap.put(user1, "User details");
        System.out.println("通过 user2 从错误的 Map 中获取的值: " + badUserMap.get(user2));  // null
    }
}
```

> 检查工具：
>
> 1. CheckStyle：Definition of 'equals()' without corresponding definition of 'hashCode()'. (17:5) [EqualsHashCode]
> 2. SpotBugs：HE_USE_OF_UNHASHABLE_CLASS (Use of class without a hashCode() method in a hashed data structure)
> 3. PMD：[OverrideBothEqualsAndHashcode](https://docs.pmd-code.org/pmd-doc-7.2.0/pmd_rules_java_errorprone.html#overridebothequalsandhashcode)

### 【J000001】强制：ArrayList 的 subList 结果不可强转成 ArrayList

否则会抛出ClassCastException 异 常，即 java.util.ArrayList$SubList cannot be cast to java.util.ArrayList。

**说明** ：subList 返回的是 ArrayList 的内部类 SubList，并不是 ArrayList 而是 ArrayList 的一个视图，对于 SubList 子列表的所有操作最终会反映到原列表上。

**正例：**

```java
import java.util.ArrayList;
import java.util.List;

public class CorrectSubListUsage {
    public static void main(String[] args) {
        ArrayList<Integer> originalList = new ArrayList<>();
        for (int i = 0; i < 10; i++) {
            originalList.add(i);
        }

        // 使用 `List` 接口来接收 `subList` 的返回结果
        List<Integer> subList = originalList.subList(2, 5);

        // 对子列表进行操作
        subList.set(0, 20);

        // 输出原列表和子列表，验证修改会反映到原列表上
        System.out.println("原列表: " + originalList);
        System.out.println("子列表: " + subList);
    }
}
```

**反例：**

```java
import java.util.ArrayList;

public class IncorrectSubListUsage {
    public static void main(String[] args) {
        ArrayList<Integer> originalList = new ArrayList<>();
        for (int i = 0; i < 10; i++) {
            originalList.add(i);
        }

        try {
            // 错误：将 subList 结果强转为 ArrayList
            ArrayList<Integer> subList = (ArrayList<Integer>) originalList.subList(2, 5);
        } catch (ClassCastException e) {
            System.out.println("捕获到 ClassCastException 异常: " + e.getMessage());
        }
    }
}
```

> 检查工具：无

### 【J000002】强制：使用 Map 的方法 keySet()/values()/entrySet()返回集合对象时，不可以对其进行添加元素操作

**说明：** `Map` 接口提供了三个方法：`keySet()`、`values()` 和 `entrySet()`，分别用于返回 `Map` 中键的集合、值的集合以及键值对的集合。需要注意的是，这些方法返回的集合对象是 `Map` 的视图，而不是独立的集合。它们反映了 `Map` 当前的状态。对这些视图集合的修改操作（除了移除元素）通常是不允许的，因为这些操作可能会破坏 `Map` 的内部结构和一致性。如果尝试对这些视图集合进行添加元素的操作，会抛出 `UnsupportedOperationException` 异常。

**正例：**

```java
import java.util.HashMap;
import java.util.Map;
import java.util.Set;

public class CorrectMapViewUsage {
    public static void main(String[] args) {
        Map<String, Integer> map = new HashMap<>();
        map.put("apple", 1);
        map.put("banana", 2);

        // 获取键的集合视图
        Set<String> keySet = map.keySet();

        // 可以进行遍历操作
        for (String key : keySet) {
            System.out.println("Key: " + key);
        }

        // 可以进行移除操作
        keySet.remove("apple");
        System.out.println("移除 apple 后 Map 的内容: " + map);
    }
}
```

**反例：**

```java
import java.util.HashMap;
import java.util.Map;
import java.util.Set;

public class IncorrectMapViewUsage {
    public static void main(String[] args) {
        Map<String, Integer> map = new HashMap<>();
        map.put("apple", 1);
        map.put("banana", 2);

        // 获取键的集合视图
        Set<String> keySet = map.keySet();

        try {
            // 错误：尝试向视图集合中添加元素
            keySet.add("cherry");
        } catch (UnsupportedOperationException e) {
            System.out.println("捕获到 UnsupportedOperationException 异常: " + e.getMessage());
        }
    }
}
```

> 检查工具：无

### 【J000003】强制：不可对 Collections 类返回的不可变列表进行添加或删除元素操作

**说明：** `Collections` 类提供了一系列实用方法，用于操作集合，其中像 `emptyList()`、`singletonList()` 等方法会返回不可变的列表对象。不可变列表意味着这些列表的内容在创建之后就不能被修改，即不能对其进行添加或者删除元素的操作。

这是因为这些不可变列表的设计目的是为了提供一种安全、轻量级且不可变的集合表示，它们在内存使用和线程安全方面有一定优势。如果对这些不可变列表进行添加或删除元素的操作，会抛出 `UnsupportedOperationException` 异常，因为这些操作违背了不可变列表的设计原则。

**正例：**

```java
import java.util.Collections;
import java.util.List;

public class CorrectUsageOfCollections {
    public static void main(String[] args) {
        // 获取不可变的空列表
        List<String> emptyList = Collections.emptyList();
        // 可以安全地使用该列表进行只读操作，如遍历
        for (String element : emptyList) {
            System.out.println(element);
        }

        // 获取不可变的单元素列表
        List<String> singletonList = Collections.singletonList("single");
        // 进行只读操作
        System.out.println(singletonList.get(0));
    }
}
```

在正例中，我们只是对 `Collections` 类返回的不可变列表进行了只读操作，如遍历和获取元素，没有尝试对其进行添加或删除元素的操作，因此不会抛出异常。

**反例：**

```java
import java.util.Collections;
import java.util.List;

public class IncorrectUsageOfCollections {
    public static void main(String[] args) {
        // 获取不可变的空列表
        List<String> emptyList = Collections.emptyList();
        try {
            // 错误：尝试向不可变列表中添加元素
            emptyList.add("newElement");
        } catch (UnsupportedOperationException e) {
            System.out.println("捕获到 UnsupportedOperationException 异常: " + e.getMessage());
        }

        // 获取不可变的单元素列表
        List<String> singletonList = Collections.singletonList("single");
        try {
            // 错误：尝试从不可变列表中删除元素
            singletonList.remove(0);
        } catch (UnsupportedOperationException e) {
            System.out.println("捕获到 UnsupportedOperationException 异常: " + e.getMessage());
        }
    }
}
```

在反例中，我们尝试对 `Collections` 类返回的不可变列表进行添加和删除元素的操作，这会触发 `UnsupportedOperationException` 异常，代码中通过捕获该异常来展示错误情况。

> 检查工具：无

### 【J000004】强制：在 subList 场景中，高度注意对原集合元素的增加或删除，均会导致子列表的遍历、增加、删除产生 ConcurrentModificationException 异常

**说明：** `ArrayList` 等集合的 `subList` 方法会返回原集合的一个子列表视图。这个子列表视图和原集合是紧密关联的，它们共享底层的数据结构。当对原集合进行元素的增加或删除操作时，会改变原集合的结构，而子列表的迭代器仍然保留着原有的结构信息。

由于子列表的迭代器期望原集合的结构保持不变，一旦原集合的结构发生改变，子列表在进行遍历、增加、删除操作时，迭代器会检测到这种结构的不一致，从而抛出 `ConcurrentModificationException` 异常。这是 Java 集合框架为了保证数据的一致性和避免并发修改问题而设计的一种机制。

**正例：**

```java
import java.util.ArrayList;
import java.util.List;

public class CorrectSubListUsage {
    public static void main(String[] args) {
        ArrayList<Integer> originalList = new ArrayList<>();
        for (int i = 0; i < 10; i++) {
            originalList.add(i);
        }

        // 获取子列表
        List<Integer> subList = originalList.subList(2, 5);

        // 只对子列表进行操作，不改变原集合结构
        subList.set(0, 20);
        System.out.println("子列表: " + subList);
        System.out.println("原列表: " + originalList);
    }
}
```

在正例中，我们仅对子列表进行操作，没有对原集合进行元素的增加或删除，所以不会触发 `ConcurrentModificationException` 异常。

**反例：**

```java
import java.util.ArrayList;
import java.util.List;

public class IncorrectSubListUsage {
    public static void main(String[] args) {
        ArrayList<Integer> originalList = new ArrayList<>();
        for (int i = 0; i < 10; i++) {
            originalList.add(i);
        }

        // 获取子列表
        List<Integer> subList = originalList.subList(2, 5);

        // 对原集合进行元素删除操作
        originalList.remove(3);

        try {
            // 尝试遍历子列表，会抛出 ConcurrentModificationException 异常
            for (Integer num : subList) {
                System.out.println(num);
            }
        } catch (ConcurrentModificationException e) {
            System.out.println("捕获到 ConcurrentModificationException 异常: " + e.getMessage());
        }
    }
}
```

在反例中，我们对原集合进行了元素删除操作，之后尝试遍历子列表，此时子列表的迭代器检测到原集合结构发生了改变，就会抛出 `ConcurrentModificationException` 异常。

> 检查工具：无

### 【J000005】强制：使用集合转数组的方法，必须使用集合的 toArray(T[] array)，传入的是类型完全一致、长度为 0 的空数组

**反例**：直接使用 toArray 无参方法存在问题，此方法返回值只能是 Object[]类，若强转其它类型数组将出现 ClassCastException 错误。
**正例**：

```java
List<String> list = new ArrayList<>(2);
list.add("guan");
list.add("bao");
String[] array = list.toArray(new String[0]);
```

**说明** ：使用 toArray 带参方法，数组空间大小的 length：

* 等于 0，动态创建与 size 相同的数组，性能最好。
* 大于 0 但小于 size，重新创建大小等于 size 的数组，增加 GC 负担。
* 等于 size，在高并发情况下，数组创建完成之后，size 正在变大的情况下，负面影响与上相同。
* 大于 size，空间浪费，且在 size 处插入 null 值，存在 NPE 隐患。

> 检查工具：无

### 【J000006】强制：在使用 Collection 接口任何实现类的 addAll()方法时，都要对输入的集合参数进行NPE 判断

**说明：**  `Collection` 接口的实现类（如 `ArrayList`、`HashSet` 等）都提供了 `addAll()` 方法，用于将另一个集合中的所有元素添加到当前集合中。以 `ArrayList` 的 `addAll()` 方法为例，其内部第一行代码通常是 `Object[] a = c.toArray();`，这里的 `c` 就是传入的集合参数。如果这个参数为 `null`，调用 `c.toArray()` 时就会抛出 `NullPointerException`（NPE）。为了避免这种异常的发生，在调用 `addAll()` 方法之前，应该对输入的集合参数进行 `null` 判断。

**正例：**

```java
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

public class CorrectAddAllUsage {
    public static void main(String[] args) {
        List<String> targetList = new ArrayList<>();
        targetList.add("element1");
        targetList.add("element2");

        Collection<String> sourceCollection = null;

        // 对输入的集合参数进行 NPE 判断
        if (sourceCollection != null) {
            targetList.addAll(sourceCollection);
        }

        System.out.println("目标列表的内容: " + targetList);
    }
}
```

在正例中，我们在调用 `addAll()` 方法之前，先对 `sourceCollection` 进行了 `null` 判断，当它不为 `null` 时才调用 `addAll()` 方法，这样就避免了 `NullPointerException` 的发生。

**反例：**

```java
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

public class IncorrectAddAllUsage {
    public static void main(String[] args) {
        List<String> targetList = new ArrayList<>();
        targetList.add("element1");
        targetList.add("element2");

        Collection<String> sourceCollection = null;

        try {
            // 错误：未对输入的集合参数进行 NPE 判断
            targetList.addAll(sourceCollection);
        } catch (NullPointerException e) {
            System.out.println("捕获到 NullPointerException 异常: " + e.getMessage());
        }
    }
}
```

在反例中，我们没有对 `sourceCollection` 进行 `null` 判断就直接调用 `addAll()` 方法，这会导致 `NullPointerException` 异常，代码中通过捕获该异常来展示错误情况。

> 检查工具：无

### 【J000007】强制：使用工具类 Arrays.asList()把数组转换成集合时，不能使用其修改集合相关的方法，它的 add/remove/clear 方法会抛出 UnsupportedOperationException 异常

**说明**：asList 的返回对象是一个 Arrays 内部类，并没有实现集合的修改方法。Arrays.asList 体现的是适配器模式，只是转换接口，后台的数据仍是数组。

**正例** ：

```java
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public class CorrectArraysAsListUsage {
    public static void main(String[] args) {
        String[] str = new String[]{"yang", "hao"};
        // 先使用 Arrays.asList() 转换，再创建一个新的可修改的集合
        List<String> list = new ArrayList<>(Arrays.asList(str));

        // 可以安全地对新集合进行修改操作
        list.add("yangguanbao");
        System.out.println("修改后的集合内容: " + list);

        // 原数组不受影响
        System.out.println("原数组内容: " + Arrays.toString(str));
    }
}
```

在正例中，我们先使用 `Arrays.asList()` 方法将数组转换为集合，然后创建一个新的 `ArrayList` 并将转换后的集合作为参数传入，这样就得到了一个可修改的集合，避免了使用 `Arrays.asList()` 返回的不可修改集合带来的问题。

**反例** ：

```java
import java.util.Arrays;
import java.util.List;

public class IncorrectArraysAsListUsage {
    public static void main(String[] args) {
        String[] str = new String[]{"yang", "hao"};
        List<String> list = Arrays.asList(str);

        try {
            // 错误：调用 add 方法会抛出 UnsupportedOperationException 异常
            list.add("yangguanbao");
        } catch (UnsupportedOperationException e) {
            System.out.println("捕获到 UnsupportedOperationException 异常: " + e.getMessage());
        }

        // 修改原数组
        str[0] = "changed";
        // 集合中的元素也会被修改
        System.out.println("修改原数组后，集合的内容: " + list);
    }
}
```

在反例中，直接使用 `Arrays.asList()` 返回的集合进行 `add` 操作，会抛出 `UnsupportedOperationException` 异常。同时，对原数组元素的修改会反映到集合中，体现了它们底层数据的共享性。

> 检查工具：无

### 【J000008】强制：在无泛型限制定义的集合赋值给泛型限制的集合时，在使用集合元素时，需要进行instanceof 判断，避免抛出 ClassCastException 异常

**说明**：泛型是在 JDK5 后才出现，考虑到向前兼容，编译器是允许非泛型集合与泛型集合互相赋值。

**反例**：

```java
List<String> generics = null;
List notGenerics = new ArrayList(10);
notGenerics.add(new Object());
notGenerics.add(new Integer(1));
generics = notGenerics;
// 此处抛出 ClassCastException 异常
String string = generics.get(0);
```

**正例**：

```java
List<String> generics = null;
List notGenerics = new ArrayList(10);
notGenerics.add(new Object());
notGenerics.add(new Integer(1));
generics = notGenerics;
if (generics.get(0) instanceof String) {
    String string = generics.get(0);
}
```

在JDK16以上，使用instanceof模式匹配可以简化类型检查和转换的代码

这种模式匹配方式减少了代码的冗余，并使得类型检查更加直观。

**正例：**

```java
AbstractObject obj = origin;
if (obj instanceof InheritanceObject inheritance) {
    // TODO 此时inheritance对象已经是InheritanceObject了
}
```

> 检查工具：无

### 【J000009】强制：不要在列表遍历的循环里进行元素的 remove/add 操作。remove 元素请使用 iterator 方式，如果并发操作，需要对 iterator 对象加锁

**说明** ：在 Java 中，当使用增强 `for` 循环（`for-each` 循环）遍历列表时，其底层是基于迭代器实现的。在遍历过程中，如果直接对列表进行 `remove` 或 `add` 操作，会改变列表的结构，而迭代器并不知道这种结构的变化。迭代器在遍历过程中会维护一个预期的列表结构，当发现实际结构与预期结构不一致时，就会抛出 `ConcurrentModificationException` 异常，这是 Java 为了保证遍历的安全性而设计的机制。

而使用迭代器的 `remove` 方法则可以避免这个问题。迭代器的 `remove` 方法会在删除元素的同时，正确地更新迭代器的状态，使其与列表的新结构保持一致。

如果在多线程环境下进行并发操作，即使使用迭代器的 `remove` 方法，也可能会出现问题，因为多个线程可能同时修改列表结构。此时，需要对迭代器对象加锁，以确保同一时间只有一个线程可以对列表进行修改操作，从而保证线程安全。

**正例**：

```java
List<String> list = new ArrayList<>(); 
list.add("1"); 
list.add("2"); 
Iterator<String> iterator = list.iterator(); 
while (iterator.hasNext()) { 
	String item = iterator.next(); 
	if ("1".equals(item)) {
		iterator.remove(); 
	} 
}
```

**反例**:

```java
for (String item : list) { 
	if ("1".equals(item)) { 
		list.remove(item); 
	} 
}
```

> 检查工具：无

### 【J000010】强制：在 JDK7 版本及以上，Comparator 实现类要满足如下三个条件，不然 Arrays.sort，Collections.sort 方法在排序过程中可能会出现混乱

**说明** ：三个条件如下

1） **反对称性**：x，y 的比较结果和 y，x 的比较结果相反。
2） **传递性**：x>y，y>z，则 x>z。
3） **一致性**：x=y，则 x，z 比较结果和 y，z 比较结果相同。

**反例** ：下例中没有处理相等的情况，交换两个对象判断结果并不互反，不符合第一个条件，在实际使用中可能会出现异常。

```java
new Comparator<Student>() { 
    @Override 
    public int compare(Student o1, Student o2) { 
        return o1.getId() > o2.getId() ? 1 : 0; 
    } 
};
```

> 检查工具：无

### 【J000011】强制：高度注意 Map 类集合 K/V 能不能存储 null 值的情况

如下表格：

| 集合类            | Key           | Value         | Super       | 说明                   |
| ----------------- | ------------- | ------------- | ----------- | ---------------------- |
| Hashtable         | 不允许为 null | 不允许为 null | Dictionary  | 线程安全               |
| ConcurrentHashMap | 不允许为 null | 不允许为 null | AbstractMap | 锁分段技术（JDK8:CAS） |
| TreeMap           | 不允许为 null | 允许为 null   | AbstractMap | 线程不安全             |
| HashMap           | 允许为 null   | 允许为 null   | AbstractMap | 线程不安全             |

**反例** ：由于 HashMap 的干扰，很多人认为 ConcurrentHashMap 是可以置入 null 值，而事实上，存储null 值时会抛出 NPE 异常。

> 检查工具：无

### 【J000012】推荐：合理利用好集合的有序性(sort)和稳定性(order)，避免集合的无序性(unsort)和不稳定性(unorder)带来的负面影响

**说明**：有序性是指遍历的结果是按某种比较规则依次排列的。稳定性指集合每次遍历的元素次序是一定的。如：ArrayList 是 order/unsort；HashMap 是 unorder/unsort；TreeSet 是 order/sort。

> 检查工具：无

### 【J000013】推荐：在JDK9以上，推荐使用List.of()、Set.of()、Map.of()和Map.ofEntries()等工厂方法创建不可变集合。这种方式可以使代码更加简洁，并且提高性能。

**说明**：不可变集合意味着程序不能向集合中添加元素，也不能从集合中删除元素。

**正例：**

```java
Set<String> languages = Set.of("java", "python", "c++", "go", "rust");
```

> 检查工具：无

## 并发处理

### 【J000014】强制：获取单例对象需要保证线程安全，其中的方法也要保证线程安全

> 此规范有必考题。

说明：资源驱动类、工具类、单例工厂类都需要注意。

> :warning: 故障警示! 本规范制定源自严重生产故障（单号：3786355）。
>
> - 在3786355故障案例中，在核心业务类的static代码块中调用单例工厂类获取缓存对象，因为单例工厂类没有保证线程安全，导致static代码块获取到尚未完成初始化的单例缓存对象，导致业务配置读取失败的故障。

**反例：**

```java
public static ConfigItemCache instance() {  
    if (null == instance) {  
        synchronized (ConfigItemCache.class) {  
            if (null == instance) {  
                instance = new ConfigItemCache();  // 此处，instance 对象尚未完成初始化，可能会被其它线程获取到，产生数据错误
                instance.init();  
                instance.registerCacheRefreshListener();  
            }  
        }  
    }  
    return instance;  
}
```

**正例：**

```java
public static ConfigItemCache instance() {  
    if (null == instance) {  
        synchronized (ConfigItemCache.class) {  
            if (null == instance) {  
                ConfigItemCache tempInstance = new ConfigItemCache();  
                tempInstance.init();  
                tempInstance.registerCacheRefreshListener();  
                instance = tempInstance;  // 此处，instance 对象已经完成初始化
            }  
        }  
    }  
    return instance;  
}
```

> 检查工具：
> 1. Spotbugs: DC_PARTIALLY_CONSTRUCTED (Possible exposure of partially initialized object)

### 【J000015】强制：线程资源必须通过线程池提供，不允许在应用中自行显式创建线程

说明：使用线程池的好处是减少在创建和销毁线程上所花的时间以及系统资源的开销，解决资源不足的问题。如果不使用线程池，有可能造成系统创建大量同类线程而导致消耗完内存或者“过度切换”的问题。

**反例** ：

```java
public class ExplicitThreadCreation {
    public static void main(String[] args) {
        // 自行显式创建 100 个线程
        for (int i = 0; i < 100; i++) {
            new Thread(() -> {
                System.out.println("Thread " + Thread.currentThread().getName() + " is running.");
                try {
                    // 模拟任务执行耗时
                    Thread.sleep(1000);
                } catch (InterruptedException e) {
                    e.printStackTrace();
                }
            }).start();
        }
    }
}
```

> 检查工具：
>
> 1. PMD：multithreading:[DoNotUseThreads](https://docs.pmd-code.org/pmd-doc-7.2.0/pmd_rules_java_multithreading.html#donotusethreads)

### 【J000016】强制：线程池不允许使用Executors去创建，而是通过ThreadPoolExecutor的方式

**说明** ：在使用线程池时，不建议使用 `Executors` 工具类来创建线程池，而应直接使用 `ThreadPoolExecutor` 类进行创建。这是因为使用 `ThreadPoolExecutor` 能让开发者更加明确线程池的运行规则，进而规避资源耗尽的风险。

`Executors` 工具类提供了一些便捷的方法来创建不同类型的线程池，然而这些方法返回的线程池对象存在明显的弊端：

* **`FixedThreadPool` 和 `SingleThreadPool`** ：这两种线程池允许的请求队列长度为 `Integer.MAX_VALUE`。当系统中有大量请求涌入时，由于请求队列可以无限增长，会堆积大量的请求任务。随着请求数量的不断增加，队列会占用越来越多的内存，最终可能导致内存溢出（OOM）。
* **`CachedThreadPool` 和 `ScheduledThreadPool`** ：这两种线程池允许创建的线程数量为 `Integer.MAX_VALUE`。在高并发场景下，如果有大量的任务提交，线程池会不断地创建新线程来处理这些任务。由于线程的创建需要消耗系统资源，当创建的线程数量达到非常大的数值时，会消耗大量的内存，同样可能导致 OOM。

通过直接使用 `ThreadPoolExecutor` 类，开发者可以根据实际业务需求，精确地配置线程池的核心线程数、最大线程数、线程空闲时间、任务队列类型等参数，从而更好地控制线程池的行为，避免出现资源耗尽的问题。

**正例** ：

```java
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

public class ThreadPoolExecutorExample {
    public static void main(String[] args) {
        // 创建一个 ThreadPoolExecutor 实例
        ThreadPoolExecutor executor = new ThreadPoolExecutor(
                2, // 核心线程数
                5, // 最大线程数
                60, // 线程空闲时间
                TimeUnit.SECONDS, // 时间单位
                new ArrayBlockingQueue<>(10) // 任务队列
        );

        // 提交任务到线程池
        for (int i = 0; i < 10; i++) {
            final int taskId = i;
            executor.submit(() -> {
                System.out.println("Task " + taskId + " is being executed by " + Thread.currentThread().getName());
                try {
                    // 模拟任务执行耗时
                    Thread.sleep(1000);
                } catch (InterruptedException e) {
                    e.printStackTrace();
                }
            });
        }

        // 关闭线程池
        executor.shutdown();
    }
}
```

在正例中，我们直接使用 `ThreadPoolExecutor` 类创建了一个线程池，明确指定了核心线程数为 2，最大线程数为 5，线程空闲时间为 60 秒，使用 `ArrayBlockingQueue` 作为任务队列，队列容量为 10。这样可以根据实际需求灵活控制线程池的资源使用，避免资源耗尽的风险。

**反例** ：

```java
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class ExecutorsExample {
    public static void main(String[] args) {
        // 使用 Executors 创建 FixedThreadPool
        ExecutorService fixedThreadPool = Executors.newFixedThreadPool(2);

        // 模拟大量任务提交
        for (int i = 0; i < Integer.MAX_VALUE; i++) {
            final int taskId = i;
            fixedThreadPool.submit(() -> {
                System.out.println("Task " + taskId + " is being executed by " + Thread.currentThread().getName());
                try {
                    // 模拟任务执行耗时
                    Thread.sleep(1000);
                } catch (InterruptedException e) {
                    e.printStackTrace();
                }
            });
        }

        // 关闭线程池
        fixedThreadPool.shutdown();
    }
}
```

在反例中，我们使用 `Executors` 工具类创建了一个 `FixedThreadPool`。由于 `FixedThreadPool` 的请求队列长度为 `Integer.MAX_VALUE`，当模拟大量任务提交时，会导致请求队列无限增长，最终可能引发 OOM 异常。

> 检查工具：无

### 【J000017】强制：SimpleDateFormat 是线程不安全的类，一般不要定义为static变量，如果定义为static，必须加锁，或者使用DateUtils工具类

**说明** ：`SimpleDateFormat` 类在多线程环境下存在线程安全问题。这是因为它内部维护了一个用于格式化和解析日期的状态，当多个线程同时使用同一个 `SimpleDateFormat` 实例进行日期操作时，可能会导致状态的混乱，从而产生错误的结果。

如果将 `SimpleDateFormat` 定义为 `static` 变量，意味着多个线程会共享这个实例，线程安全问题会更加突出。为了避免这种情况，可以采取以下几种方式：

1. 使用 `DateUtils` 工具类，它通常提供了线程安全的日期处理方法。
2. 若定义为 `static` 变量，需要在使用时进行加锁操作，确保同一时间只有一个线程能够访问和修改其内部状态。
3. 使用 `ThreadLocal` 来为每个线程提供独立的 `SimpleDateFormat` 实例。`ThreadLocal` 会为每个线程创建一个副本，这样每个线程在操作日期时使用的是自己的 `SimpleDateFormat` 实例，从而避免了线程安全问题。

对于 JDK8 及以上版本的应用，推荐使用新的日期和时间 API，如 `Instant` 代替 `Date`，`LocalDateTime` 代替 `Calendar`，`DateTimeFormatter` 代替 `SimpleDateFormat`。这些新的 API 具有简单、美观、强大、不可变且线程安全的特点，能够更好地满足现代应用对日期和时间处理的需求。

**正例** ：

```java
import java.text.DateFormat;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

// 使用 ThreadLocal 的示例
class ThreadLocalDateFormatExample {
    private static final ThreadLocal<DateFormat> df = new ThreadLocal<DateFormat>() {
        @Override
        protected DateFormat initialValue() {
            return new SimpleDateFormat("yyyy-MM-dd");
        }
    };

    public static String formatDate(Date date) {
        return df.get().format(date);
    }

    public static Date parseDate(String str) throws ParseException {
        return df.get().parse(str);
    }
}

// 使用 JDK8 新日期 API 的示例
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

class Jdk8DateApiExample {
    public static String formatDate() {
        LocalDateTime now = LocalDateTime.now();
        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
        return now.format(formatter);
    }

    public static Instant parseDate(String str) {
        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
        LocalDateTime ldt = LocalDateTime.parse(str, formatter);
        return ldt.atZone(ZoneId.systemDefault()).toInstant();
    }
}

public class DateFormatThreadSafetyExample {
    public static void main(String[] args) {
        ExecutorService executorService = Executors.newFixedThreadPool(5);

        // 使用 ThreadLocal 的示例
        executorService.submit(() -> {
            try {
                Date date = new Date();
                System.out.println("ThreadLocal 示例 - 格式化日期: " + ThreadLocalDateFormatExample.formatDate(date));
                Date parsedDate = ThreadLocalDateFormatExample.parseDate("2024-01-01");
                System.out.println("ThreadLocal 示例 - 解析日期: " + parsedDate);
            } catch (ParseException e) {
                e.printStackTrace();
            }
        });

        // 使用 JDK8 新日期 API 的示例
        executorService.submit(() -> {
            System.out.println("JDK8 新日期 API 示例 - 格式化日期: " + Jdk8DateApiExample.formatDate());
            Instant parsedInstant = Jdk8DateApiExample.parseDate("2024-01-01 12:00:00");
            System.out.println("JDK8 新日期 API 示例 - 解析日期: " + parsedInstant);
        });

        executorService.shutdown();
    }
}
```

在上述正例中，`ThreadLocalDateFormatExample` 类使用 `ThreadLocal` 为每个线程提供独立的 `SimpleDateFormat` 实例，避免了线程安全问题。`Jdk8DateApiExample` 类展示了如何使用 JDK8 新的日期和时间 API 进行日期的格式化和解析，这些 API 是线程安全的。

**反例** ：

```java
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class UnsafeDateFormatExample {
    private static SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd");

    public static String formatDate(Date date) {
        return sdf.format(date);
    }

    public static Date parseDate(String str) {
        try {
            return sdf.parse(str);
        } catch (Exception e) {
            e.printStackTrace();
            return null;
        }
    }

    public static void main(String[] args) {
        ExecutorService executorService = Executors.newFixedThreadPool(5);

        for (int i = 0; i < 5; i++) {
            executorService.submit(() -> {
                Date date = new Date();
                System.out.println("不安全示例 - 格式化日期: " + formatDate(date));
                Date parsedDate = parseDate("2024-01-01");
                System.out.println("不安全示例 - 解析日期: " + parsedDate);
            });
        }

        executorService.shutdown();
    }
}
```

在反例中，`sdf` 被定义为 `static` 变量，多个线程共享同一个 `SimpleDateFormat` 实例。在多线程环境下，可能会因为线程安全问题导致日期格式化和解析出现错误的结果。

> 检查工具：
>
> 1. SpotBugs：Multithreaded correctness (Static use of type Calendar or DateFormat) STCAL_INVOKE_ON_STATIC_DATE_FORMAT_INSTANCE (Call to static DateFormat)
> 2. PMD：[SimpleDateFormatNeedsLocale](https://docs.pmd-code.org/pmd-doc-7.2.0/pmd_rules_java_errorprone.html#simpledateformatneedslocale)：Be sure to specify a Locale when creating SimpleDateFormat instances to ensure that locale-appropriate formatting is used.

### 【J000018】强制：高并发时，同步调用应该去考量锁的性能损耗

**说明** ：在高并发场景下，同步调用涉及到锁的使用，而锁的使用会带来一定的性能损耗。因为当一个线程获取到锁后，其他需要该锁的线程就会被阻塞，等待锁的释放，这会导致线程上下文切换，增加系统的开销。因此，在设计同步代码时，需要仔细考量锁的性能影响，采取合适的策略来减少锁带来的性能损耗。

以下是一些具体的优化策略：

1. **缩小锁的范围** ：尽可能使加锁的代码块工作量尽可能小。因为锁的持有时间越长，其他线程等待的时间就越久，会降低系统的并发性能。所以，只对那些真正需要同步的代码进行加锁，避免在锁代码块中执行一些耗时的操作，例如调用 RPC（远程过程调用）方法。RPC 方法通常涉及网络通信，执行时间较长，将其放在锁代码块中会导致锁的持有时间变长，影响系统的并发处理能力。
2. **优先使用无锁数据结构** ：无锁数据结构（如 `ConcurrentHashMap`、`AtomicInteger` 等）通过使用 CAS（比较并交换）等技术，避免了锁的使用，从而减少了线程阻塞和上下文切换的开销，在高并发场景下具有更好的性能。所以，在满足业务需求的前提下，优先选择无锁数据结构来替代使用锁的实现。
3. **细化锁的粒度** ：能锁区块，就不要锁整个方法体。将锁的范围缩小到需要同步的最小代码块，而不是对整个方法进行加锁。这样可以使更多的线程能够同时执行方法中的其他代码，提高系统的并发性能。
4. **选择合适的锁类型** ：能用对象锁，就不要用类锁。对象锁是针对对象实例的，不同的对象实例可以有不同的锁，多个线程可以同时访问不同对象实例的同步代码块；而类锁是针对类的，同一时刻只有一个线程能够访问类的同步代码块。所以，在不需要对整个类进行同步的情况下，优先使用对象锁。

**正例** ：

```java
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

// 示例类，展示锁的优化使用
class LockOptimizationExample {
    private final ConcurrentMap<String, Integer> concurrentMap = new ConcurrentHashMap<>();
    private final Object objectLock = new Object();

    // 无锁数据结构的使用
    public void updateConcurrentMap(String key, int value) {
        concurrentMap.put(key, value);
    }

    // 细化锁的粒度，只对关键部分加锁
    public int calculateSum(int[] array) {
        int sum = 0;
        // 先进行非同步的计算
        for (int i = 0; i < array.length - 1; i++) {
            sum += array[i];
        }
        // 对最后一个元素的计算进行同步，不考虑业务合理性，仅做示例
        synchronized (objectLock) {
            sum += array[array.length - 1];
        }
        return sum;
    }
}

public class Main {
    public static void main(String[] args) {
        LockOptimizationExample example = new LockOptimizationExample();
        example.updateConcurrentMap("key1", 10);
        int[] array = {1, 2, 3, 4, 5};
        int sum = example.calculateSum(array);
        System.out.println("计算结果: " + sum);
    }
}
```

在正例中，使用了 `ConcurrentHashMap` 这个无锁数据结构来进行数据的更新操作，避免了锁的使用。在 `calculateSum` 方法中，只对最后一个元素的计算进行了加锁，缩小了锁的范围，提高了并发性能。

**反例** ：

```java
import java.util.HashMap;
import java.util.Map;

// 示例类，展示不合理的锁使用
class BadLockUsageExample {
    private final Map<String, Integer> map = new HashMap<>();

    // 锁整个方法体，范围过大
    public synchronized void updateMap(String key, int value) {
        // 模拟 RPC 调用
        try {
            Thread.sleep(100);
        } catch (InterruptedException e) {
            e.printStackTrace();
        }
        map.put(key, value);
    }
}

public class BadMain {
    public static void main(String[] args) {
        BadLockUsageExample example = new BadLockUsageExample();
        example.updateMap("key1", 10);
    }
}
```

在反例中，`updateMap` 方法使用了 `synchronized` 关键字对整个方法进行加锁，锁的范围过大。并且在锁代码块中模拟了一个 RPC 调用，导致锁的持有时间变长，会严重影响系统的并发性能。

> 检查工具：
>
> 1. PMD：[AvoidSynchronizedAtMethodLevel](https://docs.pmd-code.org/pmd-doc-7.2.0/pmd_rules_java_multithreading.html#avoidsynchronizedatmethodlevel)

### 【J000019】强制：对多个资源、数据库表、对象同时加锁时，需要保持一致的加锁顺序，否则可能会造成死锁

说明：线程一需要对表A、B、C依次全部加锁后才可以进行更新操作，那么线程二的加锁顺序也必须是A、B、C，否则可能出现死锁。

> 检查工具：无

### 【J000020】强制：并发修改同一记录时，避免更新丢失，需要加锁。要么在应用层加锁，要么在缓存加锁，要么在数据库层使用乐观锁，使用version作为更新依据

说明：如果每次访问冲突概率小于20%，推荐使用乐观锁，否则使用悲观锁。乐观锁的重试次数不得小于3次。

> 检查工具：无

### 【J000021】强制：禁止使用 Timer 和 TimerTask 调度多任务，避免因未捕获单个任务异常而导致所有任务终止

> 此规范有必考题。

> :warning: 故障警示! 本规范制定源自严重生产故障（单号：3787793）。
>
> - 在3787793故障案例中，通过 Timer 提交了多个任务，包含了内存清理的任务，当应用繁忙内存资源不足的时候，会导致某些定时任务失败以及整个Timer定时任务的退出，数据无法得到及时清理，引发了OOM的故障。

1. **禁止直接使用 `Timer` 调度任务**

   * **原因**：`Timer` 单线程执行所有 `TimerTask`，若任一任务抛出未捕获异常，整个 `Timer` 线程终止，**其他任务将不再执行**。
   * **替代方案**：使用 `ScheduledExecutorService`（基于线程池），其任务异常仅影响当前任务，不扩散至其他任务。
2. **正例：使用 `ScheduledExecutorService`**

```java
    // 创建线程池（支持多线程并行）
    ScheduledExecutorService executor = Executors.newScheduledThreadPool(4);
  
    // 提交任务，即使 task2 抛出异常，task1 仍正常执行
    executor.scheduleAtFixedRate(this::task1, 0, 1, TimeUnit.SECONDS);
    executor.scheduleAtFixedRate(this::task2, 0, 2, TimeUnit.SECONDS);
```

3. **反例：`Timer` 导致任务链式终止**

```java
    Timer timer = new Timer();
    timer.schedule(new TimerTask() {
        @Override
        public void run() {
            throw new RuntimeException("Task1 异常"); // 未捕获异常，Timer 线程终止
        }
    }, 0, 1000);
  
    timer.schedule(new TimerTask() { // 此任务永远不会执行
        @Override
        public void run() { /* ... */ }
    }, 0, 1000);
```

4. **异常处理要求**

   * **强制**：在任务逻辑内部捕获所有异常，并记录日志，禁止异常抛出至线程池。
   * **推荐**：通过 `try-catch` 包裹任务代码，结合监控告警：

```java
    executor.scheduleAtFixedRate(() -> {
        try {
            // 业务逻辑
        } catch (Exception e) {
            logger.error("定时任务执行失败", e); // 记录异常，任务继续运行
        }
    }, 0, 1, TimeUnit.SECONDS);
```

5. **线程池配置**

   * **必须**根据任务类型（CPU 密集型/IO 密集型）合理设置线程池大小，避免资源耗尽：

```java
        // 正例：指定线程池大小（建议 CPU 核数 + 1）
        ScheduledExecutorService executor = Executors.newScheduledThreadPool(
            Runtime.getRuntime().availableProcessors() + 1
        );

```

> 检查工具：
> 1. Spotbugs:FORBID_TIMER (通过自定义插件WhaleCloud Spotbugs Plugin实现)

### 【J000022】强制：使用Lock类加锁时，必须确保锁范围内的所有代码都受到 try-finally 的保护，以确保在必要时释放锁

建议在try代码块之前调用lock方法，避免由于加锁失败导致finally调用unlock抛出异常。

**正例**

```java
Lock l = ...;
l.lock();
try {
  // access the resource protected by this lock
} finally {
  l.unlock();
}
```

> 检查工具：无

### 【J000023】强制：HashMap在容量不够进行resize时由于高并发可能出现死循环，导致CPU飙升，在多线程访问Map的场景下可以使用其它数据结构或加锁来规避此风险

说明：此问题在JDK8之前一直存在，在多线程访问Map的场景下，应使用ConcurrentHashMap。

> 检查工具：无

### 【J000024】推荐：使用CountDownLatch进行异步转同步操作，每个线程退出前必须调用countDown方法

说明：线程执行代码注意catch异常，确保countDown方法被执行到，避免主线程无法执行至await方法，直到超时才返回结果。注意，子线程抛出异常堆栈，不能在主线程try-catch到。

**正例** ：

```java
public class CountDownLatchExample {
    public static void main(String[] args) {
        int threadCount = 5;
        CountDownLatch countDownLatch = new CountDownLatch(threadCount);
        ExecutorService executorService = ..

        for (int i = 0; i < threadCount; i++) {
            final int taskId = i;
            executorService.submit(() -> {
                try {
                    // 模拟子线程执行任务  
                } catch (InterruptedException e) {
                    e.printStackTrace();
                } finally {
                    // 确保 countDown 方法被执行
                    countDownLatch.countDown();
                }
            });
        }

        try {
            // 主线程等待子线程完成任务
            System.out.println("主线程等待子线程完成任务...");
            countDownLatch.await();
            System.out.println("所有子线程任务已完成，主线程继续执行");
        } catch (InterruptedException e) {
            e.printStackTrace();
        } finally {
            executorService.shutdown();
        }
    }
}
```

> 检查工具：无

### 【J000025】推荐：避免Random实例被多线程使用

说明：虽然共享该实例是线程安全的，但会因竞争同一seed 导致的性能下降。其中Random实例包括java.util.Random 的实例或者 Math.random()的方式。
**正例**在JDK7之后，可以直接使用API ThreadLocalRandom，而在 JDK7之前，需要编码保证每个线程持有一个实例。

> 检查工具：无

### 【J000026】强制：在并发场景下，双重检查锁（double-checked locking）实现延迟初始化的隐患可以通过将目标属性声明为volatile型来解决

在并发编程里，有时我们希望实现延迟初始化，也就是在对象真正被使用时才进行初始化，以此来提升性能和节省资源。双重检查锁（Double - Checked Locking）就是为了实现延迟初始化，同时确保在多线程环境下只有一个实例被创建而设计的一种优化手段。

**双重检查锁存在的问题**

在早期的 Java 版本中，双重检查锁存在一个严重的问题，即可能会出现 “部分初始化” 的对象。问题的根源在于 Java 中的对象创建过程并非原子操作，`helper = new Helper();` 这行代码在 JVM 中实际上会分为以下三个步骤：

1. **分配内存空间** ：为 `Helper` 对象分配一块内存区域。
2. **初始化对象** ：在分配的内存空间中对 `Helper` 对象进行初始化操作。
3. **将引用指向内存空间** ：将 `helper` 引用指向分配的内存空间。

由于 Java 编译器和处理器可能会对指令进行重排序优化，上述步骤 2 和步骤 3 的执行顺序可能会被打乱，也就是先将引用指向内存空间，再进行对象的初始化。在多线程环境下，当一个线程看到 `helper` 引用不为 `null` 时，它会认为对象已经初始化完成，但实际上对象可能还处于部分初始化的状态，这就会导致其他线程使用到不完整的对象，从而引发各种难以调试的问题。

**反例：**

```java
class Singleton {   
    private Helper helper = null;  
    public Helper getHelper() {  
        if (helper == null) 
            synchronized(this) {  
                if (helper == null)  
                    helper = new Helper();  
            }  
        return helper;  
    }  
    // other methods and fields...  
}
```

在这个反例中，`helper` 变量没有被声明为 `volatile` 类型。在多线程环境下，由于指令重排序的存在，可能会出现以下情况：

1. 线程 A 进入 `getHelper()` 方法，发现 `helper` 为 `null`，于是进入同步块。
2. 线程 A 执行 `helper = new Helper();`，由于指令重排序，先将 `helper` 引用指向了分配的内存空间，但对象还未完成初始化。
3. 此时线程 B 进入 `getHelper()` 方法，检查 `helper` 不为 `null`，直接返回了 `helper` 引用，但这个引用指向的是一个部分初始化的对象，线程 B 在使用这个对象时就可能会出现错误。

**正例：**

在 JDK 5 及以上版本中，可以通过将目标属性声明为 `volatile` 型来解决这个问题。`volatile` 关键字可以禁止指令重排序，保证 `helper` 引用在被赋值时，对象已经完成了初始化。

```java
class Singleton {   
    private volatile Helper helper = null;  
    public Helper getHelper() {  
        if (helper == null) 
            synchronized(this) {  
                if (helper == null)  
                    helper = new Helper();  
            }  
        return helper;  
    }  
    // other methods and fields...  
}
```

> 检查工具：
> 1. Spotbugs:[DC_DOUBLECHECK](https://www.cs.umd.edu/~pugh/java/memoryModel/DoubleCheckedLocking.html)

### 【J000027】推荐：volatile 可以解决多线程内存不可见问题，但无法解决线程安全问题

在多线程编程里，`volatile` 关键字能解决内存可见性的问题。当程序处于 “一写多读” 的情况时，也就是只有一个线程负责修改变量，而有多个线程负责读取该变量，`volatile` 可以保证数据同步，让读取线程能及时获取到最新的变量值。

不过，如果存在多个线程同时对变量进行写操作，`volatile` 就没办法保证线程安全了。因为 `volatile` 关键字只能确保变量的可见性，却不能保证操作的原子性。例如像 `count++` 这样的操作，它实际上包含了读取、加 1 和写入三个步骤，在多线程环境下，多个线程同时进行 `count++` 操作时，就可能出现数据覆盖等线程安全问题。

说明：如果是count++操作，使用如下类实现：

```java
AtomicInteger count = new AtomicInteger(); 
count.addAndGet(1); 
```

如果是JDK8，推荐使用`LongAdder`对象，比`AtomicLong`性能更好（减少乐观锁的重试次数）。

**反例：**

在下面这个例子中，`count` 变量被 `volatile` 修饰，保证了其可见性。但 `count++` 操作不是原子性的，它包含读取、加 1 和写入三个步骤。在多线程环境下，多个线程可能同时读取到相同的 `count` 值，然后各自加 1 并写入，导致最终结果小于预期的 10000。

```java
public class VolatileMultiWriteExample {
    // 使用 volatile 修饰变量
    private static volatile int count = 0;

    public static void main(String[] args) throws InterruptedException {
        // 创建 10 个线程
        Thread[] threads = new Thread[10];
        for (int i = 0; i < 10; i++) {
            threads[i] = new Thread(() -> {
                for (int j = 0; j < 1000; j++) {
                    // 非原子性的 count++ 操作
                    count++;
                }
            });
            threads[i].start();
        }

        // 等待所有线程执行完毕
        for (Thread thread : threads) {
            thread.join();
        }

        // 预期结果是 10 * 1000 = 10000
        System.out.println("Final count should be 10000, but is: " + count);
    }
}
```

> 检查工具：无

## 控制语句

### 【J000028】强制：在一个 switch 块内，每个 case 要么通过 continue/break/return 等来终止，要么注释说明程序将继续执行到哪一个 case 为止；在一个 switch 块内，都必须包含一个default 语句并且放在最后，即使它什么代码也没有

**说明**：注意 break 是退出 switch 语句块，而 return 是退出方法体。

**正例：**

```java
public class SwitchExample {
    public static String getDayType(int day) {
        switch (day) {
            case 1:
            case 2:
            case 3:
            case 4:
            case 5:
                // 这里没有 break，程序会继续执行到下一个有 break 的 case
                // 因为周一到周五都是工作日，所以统一处理
                return "Weekday";
            case 6:
            case 7:
                return "Weekend";
            default:
                // 处理输入的 day 不在 1 - 7 范围内的情况
                return "Invalid day";
        }
    }
}
```

> 检查工具：无

### 【J000029】强制：当 switch 括号内的变量类型为 String 并且此变量为外部参数时，必须先进行 null判断

**反例**：以下代码会抛出NPE异常

```java
public class SwitchString {
    public static void main(String[] args) {
        method(null);
    }
    public static void method(String param) {
        switch (param) {
                // 肯定不是进入这里
            case "sth":
                System.out.println("it's sth");
                break;
                // 也不是进入这里
            case "null":
                System.out.println("it's null");
                break;
                // 也不是进入这里
            default:
                System.out.println("default");
        }
    } 
}
```

> 检查工具：
>
> 1. SpotBugs：Correctness (Null pointer dereference)
>    NP_NULL_PARAM_DEREF_NONVIRTUAL (Non-virtual method call passes null for non-null parameter)

### 【J000030】强制：在 if/else/for/while/do 语句中必须使用大括号

**说明**：即使只有一行代码，避免采用单行的编码方式：if (condition) statements;

> 检查工具：
>
> 1. PMD：[ControlStatementBraces](https://docs.pmd-code.org/pmd-doc-7.2.0/pmd_rules_java_codestyle.html#controlstatementbraces)
> 2. Checkstyle: 'if' construct must use '{}'s. [NeedBraces]

### 【J000031】强制：在高并发场景中，避免使用"等于"判断作为中断或退出的条件

**说明**：如果并发控制没有处理好，容易产生等值判断被“击穿”的情况，使用大于或小于的区间判断条件来代替。

**反例：**

下面的例子在发放奖品时，使用 `while (prizeCount != 0)` 进行循环判断。在高并发场景下，由于多个线程同时操作 `prizeCount`，可能会出现多个线程同时判断 `prizeCount` 不为 0，然后同时进入同步块发放奖品，导致 `prizeCount` 直接从 1 变成 -1，从而跳过了 `prizeCount` 等于 0 的情况，活动无法正常终止。

```java
public class PrizeDistributionNegative {
    // 使用 volatile 保证变量的可见性
    private static volatile int prizeCount = 10; 

    public static void main(String[] args) {
        ExecutorService executor = Executors.newFixedThreadPool(5);

        // 模拟多个线程同时发放奖品
        for (int i = 0; i < 20; i++) {
            executor.submit(() -> {
                while (prizeCount != 0) {
                    synchronized (PrizeDistributionNegative.class) {
                        if (prizeCount > 0) {
                            // 模拟发放奖品的操作
                            System.out.println(Thread.currentThread().getName() + " 发放了一个奖品，剩余奖品数量: " + (--prizeCount));
                        }
                    }
                }
                System.out.println(Thread.currentThread().getName() + " 发现奖品已发完，停止发放。");
            });
        }
        executor.shutdown();
    }
}
```

**正例：**

在发放奖品时，使用 `while (prizeCount > 0)` 进行循环判断，只有当奖品数量大于 0 时才会进入发放逻辑。在同步块内再次检查 `prizeCount > 0`，避免多个线程同时进入同步块导致超发奖品。

```java
public class PrizeDistributionPositive {
    // 使用 volatile 保证变量的可见性
    private static volatile int prizeCount = 10; 

    public static void main(String[] args) {
        ExecutorService executor = Executors.newFixedThreadPool(5);

        // 模拟多个线程同时发放奖品
        for (int i = 0; i < 20; i++) {
            executor.submit(() -> {
                while (prizeCount > 0) {
                    synchronized (PrizeDistributionPositive.class) {
                        if (prizeCount > 0) {
                            // 模拟发放奖品的操作
                            System.out.println(Thread.currentThread().getName() + " 发放了一个奖品，剩余奖品数量: " + (--prizeCount));
                        }
                    }
                }
                System.out.println(Thread.currentThread().getName() + " 发现奖品已发完，停止发放。");
            });
        }
        executor.shutdown();
    }
}
```

> 检查工具：无

### 【J000032】强制：如果一个包含二元运算符的表达式出现在三元运算符" ? : "的"?"之前，那么应该给表达式添上一对圆括号

**正例：**

```java
(x >= 0) ? x : -x; 
```

> 检查工具：无

### 【J000033】推荐：若一个查询方法查询的记录数为0时，不要返回null，而是返回一个空的List

**正例：**

```java
// 获取配置项为空，使用初始值为默认值，防止因没有配置项而抛空引用异常
// 100 为默认值
channelId = clientContext.params.getStr(SMPPConstants.BSS_CHANNEL_ID, "100");

// 调用List size()方法前,先进行空引用判断
List subsList = subsDAO.selectSubsList();
if(subsList!=null && subsList.size()>0){  
	// ... ...
}

```

> 检查工具：无

### 【J000034】推荐：表达异常的分支时，少用 if-else 方式，如果非要使用，请勿超过3层

if-else 的这种方式可以改写成：

```java
if (condition) { 
    // ... 
 	return obj; 
} 
// 接着写 else 的业务逻辑代码; 
```

**说明**：如果非要使用 if()...else if()...else...方式表达逻辑，为避免后续代码维护困难，***【强制】*** 请勿超过 3 层。

正例：超过 3 层的 if-else 的逻辑判断代码可以使用卫语句、策略模式、状态模式等来实现，其中卫语句即代码逻辑先考虑失败、异常、中断、退出等直接返回的情况，以方法多个出口的方式，解决代码中判断分支嵌套的问题，这是逆向思维的体现。

**正例：**

```java
public void findBoyfriend(Man man) {
	if (man.isUgly()) {
     	System.out.println("本姑娘是外貌协会的资深会员");
     	return;
    }
    if (man.isPoor()) {
    	System.out.println("贫贱夫妻百事哀");
    	return;
    }
    if (man.isBadTemper()) {
    	System.out.println("银河有多远，你就给我滚多远");
     	return;
    }
    System.out.println("可以先交往一段时间看看");
}
```

> 检查工具：
>
> 1. Checkstyle: Nested if-else depth is 4 (max allowed is 3). (13:25) [NestedIfDepth]

### 【J000035】推荐：不要在条件判断中执行复杂语句，将复杂逻辑判断的结果赋值给一个有意义的布尔变量名，以提高可读性

**说明**：很多 if 语句内的逻辑表达式相当复杂，与、或、取反混合运算，甚至各种方法纵深调用，理解成本非常高。如果赋值一个非常好理解的布尔变量名字，则是件令人爽心悦目的事情。

**正例：**

```java
// 伪代码如下
final boolean existed = (file.open(fileName, "w") != null) && (...) || (...);
if (existed) {
	...
}
```

**反例：**

```java
public final void acquire(long arg) {
 	if (!tryAcquire(arg) &&
 		acquireQueued(addWaiter(Node.EXCLUSIVE), arg)) {
 		selfInterrupt();
 	} 
}
```

> 检查工具：无

### 【J000036】推荐：不要在其它表达式中插入赋值语句，赋值语句要清晰地单独为一行

**说明**：赋值点类似于人体的穴位，对于代码的理解至关重要，所以赋值语句需要清晰地单独成为一行。

**反例**:

```java
public Lock getLock(boolean fair) {
    // 算术表达式中出现赋值操作，容易忽略 count 值已经被改变
 	threshold = (count = Integer.MAX_VALUE) - 1;
 	// 条件表达式中出现赋值操作，容易误认为是 sync==fair
	return (sync = fair) ? new FairSync() : new NonfairSync();
}
```

> 检查工具：无

### 【J000037】推荐：循环体中的语句要考量性能

以下操作尽量移至循环体外处理，如定义对象、变量、获取数据库连接，以及不必要的 try-catch 操作。

**反例** ：

```java
for (int i = 0; i < 1000; i++) {
    // 每次循环都重新定义和初始化 StringBuilder 对象
    StringBuilder sb = new StringBuilder();
    sb.append("Number: ").append(i);
    //...
}
```

**正例** ：

```java
// 将 StringBuilder 对象的定义移到循环体外部
StringBuilder sb = new StringBuilder();
for (int i = 0; i < 1000; i++) {
    sb.setLength(0); // 清空 StringBuilder 的内容
    sb.append("Number: ").append(i);
    //...
}
```

> 检查工具：
>
> 1. PMD: [AvoidInstantiatingObjectsInLoops](https://docs.pmd-code.org/pmd-doc-7.2.0/pmd_rules_java_performance.html#avoidinstantiatingobjectsinloops)

### 【J000038】推荐：避免采用取反逻辑运算符

**说明**：取反逻辑不利于快速理解，并且取反逻辑写法必然存在对应的正向逻辑写法。

**正例**：使用 if (x < 628) 来表达 x 小于 628。

**反例**：使用 if (!(x >= 628)) 来表达 x 小于 628。

> 检查工具：
>
> 1. PMD: [LogicInversion](https://docs.pmd-code.org/pmd-doc-7.2.0/pmd_rules_java_design.html#logicinversion)

## 异常处理

### 【J000039】强制：Java 类库中定义的可以通过预检查方式规避的 RuntimeException 异常不应该通过 catch 的方式来处理，比如：NullPointerException，IndexOutOfBoundsException 等

<span style="color:orange">说明</span>：无法通过预检查的异常除外，比如，在解析字符串形式的数字时，可能存在数字格式错误，不得不通过 catch NumberFormatException 来实现。
**正例：**

```java
if (obj != null) {...}
```

**反例：**

```java
try { 
    obj.method(); 
} 
catch (NullPointerException e) {
    // xxx
}
```

> 检查工具：
>
> 1. PMD:[AvoidCatchingNPE](https://docs.pmd-code.org/pmd-doc-7.2.0/pmd_rules_java_errorprone.html#avoidcatchingnpe)
> 2. PMD:[AvoidCatchingGenericException](https://docs.pmd-code.org/pmd-doc-7.2.0/pmd_rules_java_design.html#avoidcatchinggenericexception)

### 【J000040】强制：异常不要用来做流程控制和条件控制

<span style="color:orange">说明</span>：异常设计的初衷是解决程序运行中的各种意外情况。异常处理涉及到创建异常对象、栈回溯等操作，这些操作会消耗大量的系统资源和时间。而条件判断只是简单地对条件进行评估，根据评估结果执行相应的代码块，执行效率更高。

**反例：**

```java
public class PositiveNumberCheckerWithException {
    public static boolean isPositive(int number) {
        try {
            if (number <= 0) {
                // 当数字不是正数时，抛出异常
                throw new IllegalArgumentException("输入的数字不是正数。");
            }
            return true;
        } catch (IllegalArgumentException e) {
            return false;
        }
    }
}
```

**正例：**

```java
public class PositiveNumberChecker {
    public static boolean isPositive(int number) {
        // 使用条件判断来检查数字是否为正数
        if (number > 0) {
            return true;
        }
        return false;
    }
}
```

> 检查工具：
>
> 1. PMD:[ExceptionAsFlowControl](https://docs.pmd-code.org/pmd-doc-7.2.0/pmd_rules_java_design.html#exceptionasflowcontrol)

### 【J000041】强制：catch 时请分清稳定代码和非稳定代码，稳定代码指的是无论如何不会出错的代码。对于非稳定代码的 catch 尽可能进行区分异常类型，再做对应的异常处理

<span style="color:orange">说明</span>：对大段代码进行 try-catch，使程序无法根据不同的异常做出正确的应激反应，也不利于定位问题，这是一种不负责任的表现。
**正例：**
用户注册的场景中，如果用户输入非法字符，或用户名称已存在，或用户输入密码过于简单，在程序上作出分门别类的判断，并提示给用户。

> 检查工具：
>
> 1. PMD:[AvoidCatchingGenericException](https://docs.pmd-code.org/pmd-doc-7.2.0/pmd_rules_java_design.html#avoidcatchinggenericexception)

### 【J000042】强制：捕获异常是为了处理它，不要捕获了却什么都不处理而抛弃之，如果不想处理它，请将该异常抛给它的调用者。最外层的业务使用者，必须处理异常，将其转化为用户可以理解的内容

> 检查工具：
>
> 1. CheckStyle: Empty catch block. [EmptyCatchBlock] [EmptyBlock]
> 2. PMD:[EmptyCatchBlock](https://docs.pmd-code.org/pmd-doc-7.2.0/pmd_rules_java_errorprone.html#emptycatchblock)

### 【J000043】强制：finally 块必须对资源对象、流对象进行关闭，有异常也要做 try-catch

> 此规范有必考题。

> :warning: 故障警示! 严重生产故障：[30999068](https://dev.iwhalecloud.com/portal/zcm-devspace/spa/task/pc/30999068)。某项目应用因为没有合理控制线程的创建和销毁，产生线程数量过多引发内存溢出（java.lang.OutOfMemoryError: native memory exhausted），导致核心系统无法登录的严重生产故障。在故障复盘时同时发现findbugs检查出代码中有不少资源泄漏类的问题（[ODR_OPEN_DATABASE_RESOURCE](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#odr-method-may-fail-to-close-database-resource-odr-open-database-resource)），存在数据库连接泄漏的隐患。(关于`ODR_OPEN_DATABASE_RESOURCE`更多细节，请参考规范最后章节的FAQ。)

**说明：** 资源对象（如数据库连接、文件句柄等）和流对象（如 `InputStream`、`OutputStream`、`Reader`、`Writer` 等）在使用完毕后必须进行关闭操作，以释放占用的系统资源。否则，可能会导致资源泄漏，进而引发性能问题甚至系统故障。

`finally` 块的作用是确保无论 `try` 块中是否发生异常，其中的代码都会被执行。因此，将资源关闭的代码放在 `finally` 块中是一个良好的编程习惯。同时，在关闭资源的过程中，也可能会抛出异常（例如关闭数据库连接时网络异常），所以需要在 `finally` 块中对可能出现的异常进行 `try-catch` 处理，以避免因关闭资源时的异常导致程序崩溃。

对于 JDK 7 及以上版本，可以使用 `try-with-resources` 语句。`try-with-resources` 语句会自动管理资源的关闭，在代码执行完毕后，会自动调用资源对象的 `close` 方法，无需手动在 `finally` 块中编写关闭代码，从而简化了代码并减少了出错的可能性。

**正例：**

```java
public class ResourceClosureExample {
    public static void main(String[] args) {
        BufferedReader br = null;
        try {
            br = new BufferedReader(new FileReader("example.txt"));
            String line;
            while ((line = br.readLine()) != null) {
                // doSth..
            }
        } catch (IOException e) {
            // doSth..
        } finally {
            if (br != null) {
                try {
                    br.close();
                } catch (IOException e) {
                    // doSth..
                }
            }
        }
    }
}

// 使用 try-with-resources 语句的示例
public class TryWithResourcesExample {
    public static void main(String[] args) {
        try (BufferedReader br = new BufferedReader(new FileReader("example.txt"))) {
            String line;
            while ((line = br.readLine()) != null) {
                // doSth..
            }
        } catch (IOException e) {
            // doSth..
        }
    }
}
```

**反例：**

```java
public class BadResourceClosureExample {
    public static void main(String[] args) {
        BufferedReader br = null;
        try {
            br = new BufferedReader(new FileReader("example.txt"));
            String line;
            while ((line = br.readLine()) != null) {
                // doSth..
            }
        } catch (IOException e) {
            // doSth..
        }
        // 错误：没有在 finally 块中关闭资源
        // 可能会导致资源泄漏
    }
}
```

> 检查工具：
>
> 1. PMD：errorprone:CloseResource, Ensure that resources (like `java.sql.Connection`, `java.sql.Statement`, and `java.sql.ResultSet` objects and any subtype of `java.lang.AutoCloseable`) are always closed after use. Failing to do so might result in resource leaks.
> 2. SpotBugs：ODR_OPEN_DATABASE_RESOURCE, ODR: Method may fail to close database resource

### 【J000044】强制：不要在 finally 块中使用 return

<span style="color:orange">说明</span>：try 块中的 return 语句执行成功后，并不马上返回，而是继续执行 finally 块中的语句，如果此处存在 return 语句，则在此直接返回，无情丢弃掉 try 块中的返回点。
**反例：**

```java
private int x = 0;
public int checkReturn() {
    try {
        // x 等于 1，此处不返回
        return ++x;
    } 
    finally {
        // 返回的结果是 2
        return ++x;
    }
}
```

> 检查工具：
>
> 1. PMD：codestyle:OnlyOneReturn，A method should have only one exit point, and that should be the last statement in the method
> 2. PMD：errorprone:ReturnFromFinallyBlock,Avoid returning from a finally block

### 【J000045】推荐：在JDK9以上，使用try-with-resources语句时，无需在try语句中声明新变量，直接使用已有资源变量即可

**正例：**

```java
InputStream resource = new FileInputStream(filepath);
try (resource) {
    // TODO
}
```

> 检查工具：无

### 【J000046】强制：抛异常与捕获异常，必须是完全匹配，或者捕获异常是抛异常的父类

> 检查工具：无

### 【J000047】推荐：防止 NPE ，是程序员的基本修养，注意 NPE 产生的场景

1） 返回类型为基本数据类型，return 包装数据类型的对象时，自动拆箱有可能产生 NPE。
**反例：** public int f() { return Integer 对象}， 如果为 null，自动解箱抛 NPE。
2） 数据库的查询结果可能为 null。
3） 集合里的元素即使 isNotEmpty，取出的数据元素也可能为 null。
4） 远程调用返回对象时，一律要求进行空指针判断，防止 NPE。
5） 对于 Session 中获取的数据，建议进行 NPE 检查，避免空指针。
6） 级联调用 obj.getA().getB().getC()；一连串调用，易产生 NPE。
**正例：**：使用 JDK8 的 Optional 类来防止 NPE 问题。

> 检查工具：无

### 【J000048】推荐：定义时区分 unchecked / checked 异常，避免直接抛出 new  RuntimeException() ，更不允许抛出 Exception 或者 Throwable，应使用有业务含义的自定义异常

**说明** ：异常可分为受检查异常（checked exception）和不受检查异常（unchecked exception）。受检查异常是在编译时就需要被处理或者声明抛出的异常，像 `IOException`、`SQLException` 这类；而不受检查异常通常是运行时异常，如 `NullPointerException`、`ArithmeticException` 等，它们在编译时无需强制处理。

在代码里直接抛出 `RuntimeException`、`Exception` 或者 `Throwable` 是不提倡的，原因如下：

* **缺乏业务含义** ：这些通用异常无法明确指出问题所在，对于调用者和后续维护者而言，很难从异常信息中知晓具体的业务错误场景。
* **不利于异常处理** ：由于它们过于宽泛，在捕获和处理时难以针对具体的业务问题采取合适的处理措施。

为了提升代码的可读性、可维护性以及可扩展性，建议定义具有业务含义的自定义异常。借助自定义异常，能够清晰地表达业务逻辑中的错误情况，使调用者更易于理解和处理异常。同时，业界已经定义了一些常用的自定义异常，例如 `DAOException`（数据访问层异常）、`ServiceException`（业务逻辑层异常）等，可优先使用这些已有的异常。

> 检查工具：
>
> 1. PMD:[AvoidThrowingRawExceptionTypes](https://docs.pmd-code.org/pmd-doc-7.2.0/pmd_rules_java_design.html#avoidthrowingrawexceptiontypes)
> 2. PMD:[AvoidCatchingGenericException](https://docs.pmd-code.org/pmd-doc-7.2.0/pmd_rules_java_design.html#avoidcatchinggenericexception)

### 【J000049】推荐：对于公司外的 http/api 开放接口必须使用“错误码”；而应用内部推荐异常抛出；跨应用间 RPC 调用优先考虑使用 Result 方式，封装 isSuccess()方法、“错误码”、“错误简短信息”

<span style="color:orange">说明</span>：关于 RPC 方法返回方式使用 Result 方式的理由：
1）使用抛异常返回方式，调用方如果没有捕获到就会产生运行时错误。
2）如果不加栈信息，只是 new 自定义异常，加入自己的理解的 error message，对于调用端解决问题的帮助不会太多。如果加了栈信息，在频繁调用出错的情况下，数据序列化和传输的性能损耗也是问题。

> 检查工具：无

### 【J000050】推荐：遵循 DRY（Don't Repeat Yourself）原则，避免出现重复的代码

<span style="color:orange">说明</span>：随意复制和粘贴代码，必然会导致代码的重复，在以后需要修改时，需要修改所有的副本，容易遗漏。必要时抽取共性方法，或者抽象公共类，甚至是组件化。
**正例：**

一个类中有多个 public 方法，都需要进行数行相同的参数校验操作，这个时候请抽取：

```java
private boolean checkParam(DTO dto) {...}
```

> 检查工具：无

### 【J000051】强制：应避免在静态块（static block）中执行复杂逻辑，并妥善处理静态块内代码在执行时可能出现的异常，避免因未捕获的异常导致类加载失败，产生 NoClassDefFoundError 错误。例如：静态块中打开资源（如文件、网络连接等），确保即使在发生异常时也能正确进行异常处理和资源关闭

> :warning: 故障警示! 本规范制定源自两起严重生产故障（单号：3611738、3786355）。
>
> - 在3611738故障案例中，由于核心类的静态初始化逻辑中没有对可预见的异常进行处理，导致关键服务启动失败，进而引发了 NoClassDefFoundError 错误，致使服务中断。
> - 在3786355故障案例中，在核心业务类的static代码块中进行关键业务配置项的读取，没有对可预见的异常进行处理，导致业务配置读取失败的故障。

**正例：**

```java
static {
	SomeResource tempResource = null;
	try {
		tempResource = new SomeResource();
		tempResource.open();
		// 进行一些初始化操作
	} catch (Exception e) {
		// 处理异常，例如记录日志等
	} finally {
		if (tempResource != null) {
			try {
				tempResource.close();
			} catch (Exception e) {
				// 处理异常，例如记录日志等
			}
		}
	}
	resource = tempResource;
}
```

**反例：**

```java
static {
	try {
		resource = new SomeResource();
		resource.open(); // 如果这里抛出异常，后续的资源关闭将不会执行
		// 进行一些初始化操作
	} catch (Exception e) {
		throw new RuntimeException("初始化失败", e);
	}
}
```

> 检查工具：无

## 资源管理

### 【J000052】强制：使用 HttpClient 时必须显式关闭响应资源，确保连接归还至连接池

> 此规范有必考题。

> :warning: 故障警示! 本规范制定源自严重生产故障（单号：3787588）。
>
> - 在3787588故障案例中，业务逻辑在处理HTTP请求时，当服务端正常返回（HttpStatus = 200）时则正常读取response流，自动释放HTTP连接；如果相应状态码非200的时候，则直接抛出异常，导致HTTP连接没有被释放引发泄漏，导致后续请求无法获取连接的故障。

1. **显式关闭响应流和连接**

   * **必须**在请求完成后调用 `CloseableHttpResponse.close()` 或通过 `try-with-resources` 自动关闭，确保底层 TCP 连接释放。
   * **必须**完全读取或消费响应体（`HttpEntity`），否则连接无法复用。若仅需关闭流而不处理内容，调用 `EntityUtils.consume(entity)`。
2. **优先使用 try-with-resources**

   * Java 7+ 环境中，`CloseableHttpClient` 和 `CloseableHttpResponse` **必须**通过 `try-with-resources` 管理资源，避免手动关闭遗漏。

```java
    // 正例：自动关闭资源
    try (CloseableHttpClient httpClient = HttpClients.createDefault();
         CloseableHttpResponse response = httpClient.execute(request)) {
        HttpEntity entity = response.getEntity();
        String result = EntityUtils.toString(entity);
    } // 自动关闭 response 和 httpClient
```

3. **禁止未关闭响应直接丢弃**

   * **禁止**以下写法，未关闭的 `response` 会导致连接泄漏：

```java
// 反例：未关闭响应，连接泄漏！
CloseableHttpResponse response = httpClient.execute(request);  
if (HttpStatus.SC_OK == response.getStatusLine().getStatusCode()) {  
    HttpEntity entity = response.getEntity();  
    if (entity != null) {  
        String result = EntityUtils.toString(entity);  
        EntityUtils.consume(entity);  
        return JSON.parseObject(result, access);  
    } else {  
        throw new RuntimeException("请求失败"); //未关闭响应，连接泄漏！
    }  
}
```

4. **配置连接池参数**

   * **必须**为 `PoolingHttpClientConnectionManager` 设置合理的最大连接数和超时时间，防止资源耗尽：

```java
    PoolingHttpClientConnectionManager cm = new PoolingHttpClientConnectionManager();
    cm.setMaxTotal(100);                  // 最大连接数
    cm.setDefaultMaxPerRoute(50);         // 单路由最大连接数
    cm.setValidateAfterInactivity(5000);  // 空闲连接校验间隔（毫秒）
    CloseableHttpClient httpClient = HttpClients.custom().setConnectionManager(cm).build();
```

5. **防御性关闭流**

   * 即使已读取响应内容，**必须**在 `finally` 块中显式关闭流，确保异常时资源释放：

```java
    CloseableHttpResponse response = null;
    try {
        response = httpClient.execute(request);
        HttpEntity entity = response.getEntity();
        String result = EntityUtils.toString(entity);
    } finally {
        if (response != null) {
            EntityUtils.consume(response.getEntity()); // 确保流关闭
            response.close();
        }
    }
```

> 检查工具：
>
> 1. PMD:[CloseResource](https://docs.pmd-code.org/pmd-doc-7.2.0/pmd_rules_java_errorprone.html#closeresource):Ensure that resources (like java.sql.Connection, java.sql.Statement, and java.sql.ResultSet objects and any subtype of java.lang.AutoCloseable) are always closed after use. Failing to do so might result in resource leaks.

## 日志规约

### 【J000053】强制：在日志输出时，字符串变量之间的拼接使用占位符的方式

**说明** ：使用占位符（ `{}`）来拼接字符串变量有重要的性能优势。在许多日志框架（如 Logback、Log4j 等）中，日志级别是可以配置的，常见的日志级别包括 `DEBUG`、`INFO`、`WARN`、`ERROR` 等。当配置的日志级别较高（如 `ERROR`）时，较低级别的日志（如 `DEBUG`）不会被输出。

如果在日志输出语句中直接进行字符串变量的拼接（如 `logger.debug("Processing trade with id: " + id + " and symbol: " + symbol);`），即使该日志级别不会被输出，字符串的拼接操作仍然会执行，这会带来不必要的性能损耗。

而使用占位符的方式，日志框架可以根据配置的日志级别动态决定是否进行字符串模板与变量的拼装。当该日志级别不会被输出时，就不会执行拼接操作，从而减少了性能开销。

**正例** ：

```java
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class LoggingExample {
    private static final Logger logger = LoggerFactory.getLogger(LoggingExample.class);

    public static void main(String[] args) {
        int id = 123;
        String symbol = "ABC";

        // 使用占位符进行日志输出
        logger.debug("Processing trade with id: {} and symbol: {}", id, symbol);
        logger.error("An error occurred while processing trade with id: {} and symbol: {}", id, symbol);
    }
}
```

**反例** ：

```java
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class BadLoggingExample {
    private static final Logger logger = LoggerFactory.getLogger(BadLoggingExample.class);

    public static void main(String[] args) {
        int id = 123;
        String symbol = "ABC";

        // 直接进行字符串拼接的日志输出
        logger.debug("Processing trade with id: " + id + " and symbol: " + symbol);
        logger.error("An error occurred while processing trade with id: " + id + " and symbol: " + symbol);
    }
}
```

> 检查工具：
>
> 1. PMD:[GuardLogStatement](https://docs.pmd-code.org/pmd-doc-7.2.0/pmd_rules_java_bestpractices.html#guardlogstatement):Whenever using a log level, one should check if the loglevel is actually enabled, or otherwise skip the associate String creation and manipulation.

### 【J000054】强制：对于 trace / debug / info / warn 级别的日志输出，如果日志输出方法的入参存在方法调用，外部必须进行日志级别的开关判断

> ⚠ 故障警示! 严重生产故障：3794409。某项目在打印日志时，使用 logger.debug("getOfferById2 offerDto = [{}]", offerDto.toString()); 的方式打印日志，这种情况即便日志级别不是DEBUG，也会执行 toString 方法，因为offerDto对象是一个重对象，调用toString的时候产生了严重的性能影响，引发故障。

<span style="color:orange">说明</span>：虽然在 debug(参数)的方法体内第一行代码 isDisabled(Level.DEBUG_INT)为真时（Slf4j 的常见实现 Log4j 和 Logback），就直接 return，但是参数可能会进行字符串拼接运算。此外，如果debug(getName())这种参数内有 getName()方法调用，无谓浪费方法调用的开销。
**正例：**

```java
// 如果判断为真，那么可以输出 trace 和 debug 级别的日志。
if (logger.isDebugEnabled()) {
    // 该日志输出方法的入参存在方法调用getName()
    logger.debug("Current ID is: {} and name is: {}", id, getName());
}
```

> 检查工具：
>
> 1. PMD:[GuardLogStatement](https://docs.pmd-code.org/pmd-doc-7.2.0/pmd_rules_java_bestpractices.html#guardlogstatement):Whenever using a log level, one should check if the loglevel is actually enabled, or otherwise skip the associate String creation and manipulation.

### 【J000055】强制：避免重复打印日志，浪费磁盘空间，务必在 log4j.xml或者logback.xml 中设置 additivity = false

**说明** ：在使用 `log4j` 或 `logback` 等日志框架时，`additivity` 这个属性是用于控制日志是否会向上级日志记录器（父记录器）传播的。当 `additivity` 设置为 `true`（默认值）时，一个日志记录器在处理日志事件时，除了按照自身的配置进行日志输出外，还会将该日志事件传递给它的父记录器进行处理，这就可能导致同一条日志被多次打印。

例如，假设存在一个根日志记录器和一个子日志记录器，子日志记录器配置了自己的输出目的地（如文件），根日志记录器也配置了输出目的地（如控制台）。如果子日志记录器的 `additivity` 为 `true`，那么当子日志记录器记录一条日志时，这条日志不仅会输出到子日志记录器指定的文件中，还会传递给根日志记录器，进而输出到控制台上，造成日志的重复打印。

为了避免这种情况，浪费磁盘空间（如果是输出到文件）或者造成不必要的信息干扰（如在控制台重复显示），我们需要将 `additivity` 设置为 `false`，这样子日志记录器在处理日志事件时，就不会将日志事件传递给父记录器，从而保证每条日志只被打印一次。

**正例** ：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
    <!-- 配置根日志记录器 -->
    <root level="info">
        <appender-ref ref="CONSOLE"/>
    </root>

    <!-- 配置子日志记录器，设置 additivity 为 false -->
    <logger name="com.taobao.dubbo.config" level="debug" additivity="false">
        <appender-ref ref="FILE"/>
    </logger>

    <!-- 配置控制台输出 appender -->
    <appender name="CONSOLE" class="ch.qos.logback.core.ConsoleAppender">
        <encoder>
            <pattern>%d{yyyy-MM-dd HH:mm:ss.SSS} [%thread] %-5level %logger{36} - %msg%n</pattern>
        </encoder>
    </appender>

    <!-- 配置文件输出 appender -->
    <appender name="FILE" class="ch.qos.logback.core.FileAppender">
        <file>logs/app.log</file>
        <encoder>
            <pattern>%d{yyyy-MM-dd HH:mm:ss.SSS} [%thread] %-5level %logger{36} - %msg%n</pattern>
        </encoder>
    </appender>
</configuration>
```

在上述正例的 `logback.xml` 配置文件中，为 `com.taobao.dubbo.config` 这个日志记录器设置了 `additivity="false"`，这样当该日志记录器记录日志时，日志不会传递给根日志记录器，只会输出到指定的文件（`logs/app.log`）中，避免了重复打印。

**反例** ：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
    <!-- 配置根日志记录器 -->
    <root level="info">
        <appender-ref ref="CONSOLE"/>
    </root>

    <!-- 配置子日志记录器，未设置 additivity（默认为 true） -->
    <logger name="com.taobao.dubbo.config" level="debug">
        <appender-ref ref="FILE"/>
    </logger>

    <!-- 配置控制台输出 appender -->
    <appender name="CONSOLE" class="ch.qos.logback.core.ConsoleAppender">
        <encoder>
            <pattern>%d{yyyy-MM-dd HH:mm:ss.SSS} [%thread] %-5level %logger{36} - %msg%n</pattern>
        </encoder>
    </appender>

    <!-- 配置文件输出 appender -->
    <appender name="FILE" class="ch.qos.logback.core.FileAppender">
        <file>logs/app.log</file>
        <encoder>
            <pattern>%d{yyyy-MM-dd HH:mm:ss.SSS} [%thread] %-5level %logger{36} - %msg%n</pattern>
        </encoder>
    </appender>
</configuration>
```

在反例的配置中，`com.taobao.dubbo.config` 这个日志记录器没有设置 `additivity`，其默认值为 `true`。因此，当该日志记录器记录日志时，日志会同时输出到指定的文件（`logs/app.log`）和控制台，导致日志重复打印，浪费资源。

> 检查工具：无

### 【J000056】强制：异常信息应该包括两类信息：案发现场信息和异常堆栈信息。如果不处理，那么通过关键字 throws 往上抛出

**正例：**

```java
    public static void processData(int[] data) throws IllegalArgumentException {
        if (data == null || data.length == 0) {
            // 案发现场信息：入参 data 为 null 或长度为 0
            String dataInfo = data != null? java.util.Arrays.toString(data) : "null";
            String errorMessage = "Input data is null or empty, data: {}";
            IllegalArgumentException e = new IllegalArgumentException(errorMessage);
            // 记录异常信息，包括案发现场信息和异常堆栈信息
            logger.error(errorMessage, dataInfo, e);
            // 将异常往上抛出
            throw e;
        }
        // 正常处理数据的逻辑
        for (int num : data) {
            System.out.println(num);
        }
    }
```

**反例：**

```java
    public static void processData(int[] data) {
        if (data == null || data.length == 0) {
            // 只记录了简单的异常消息，没有案发现场信息
            logger.error("Input data is null or empty");
            // 没有往上抛出异常，导致异常被忽略
        }
        // 正常处理数据的逻辑
        for (int num : data) {
            System.out.println(num);
        }
    }
```

> 检查工具：无

### 【J000057】强制：国际化团队或海外部署的服务器由于字符集问题，使用全英文来注释和描述日志错误信息

> 检查工具：无

### 【J000058】强制：谨慎地记录日志。生产环境禁止输出 debug 日志 ； 有选择地输出 info 日志 ； 如果使用 warn 来记录刚上线时的业务行为信息，一定要注意日志输出量的问题，避免把服务器磁盘撑爆，并记得及时删除这些观察日志

<span style="color:orange">说明</span>：大量地输出无效日志，不利于系统性能提升，也不利于快速定位错误点。记录日志时请思考：这些日志真的有人看吗？看到这条日志你能做什么？能不能给问题排查带来好处？

> 检查工具：无

### 【J000059】推荐：可以使用 warn 日志级别来记录用户输入参数错误的情况，避免用户投诉时，无所适从。如非必要，请不要在此场景打出 error 级别，避免频繁报警

<span style="color:orange">说明</span>：注意日志输出的级别，error 级别只记录系统逻辑出错、异常或者重要的错误信息。

> 检查工具：无

## 其他

### 【J000060】推荐：Long 或 long 类型变量赋值时，数值后使用大写 L，不能是小写 l ，小写容易跟数字混淆，造成误解

> 检查工具：无

### 【J000061】强制：注意  Math.random() 这个方法返回是 double 类型，取值范围 0≤ x <1 （ 能够取到零值，注意除零异常 ） ，如果想获取整数类型的随机数，不要将 x 放大 10 的若干倍然后取整，直接使用 Random 对象的 nextInt 值 或者nextLong方法

> 检查工具：无

### 【J000062】推荐：获取当前毫秒数用System.currentTimeMillis(); 而不是 new Date().getTime()

**说明**：查看 `java.util.Date` 的源码可知，`new Date()` 的无参构造函数实际上调用的就是 `System.currentTimeMillis()` 。所以，直接使用 `System.currentTimeMillis()` 不仅能达到相同的获取毫秒数目的，还能避免创建 `Date` 对象带来的额外性能开销。如果想获取更加精确的纳秒级时间值，使用 System.nanoTime()的方式。在 JDK8 中，针对统计时间等场景，推荐使用 Instant 类。

> 检查工具：无

### 【J000063】强制：日期格式化时，传入 pattern 中表示年份统一使用小写的 y

**说明**：日期格式化时， yyyy 表示当天所在的年，而大写的 YYYY 代表是 week in which year（JDK7 之后引入的概念），意思是当天所在的周属于的年份，一周从周日开始，周六结束，只要本周跨年，返回的 YYYY 就是下一年。另外需要注意：

- 表示月份是大写的 M
- 表示分钟则是小写的 m
- 24 小时制的是大写的 H
- 12 小时制的则是小写的 h

**正例：**
表示日期和时间的格式如下所示：

```java
new SimpleDateFormat("yyyy-MM-dd HH:mm:ss"); 
```

> 检查工具：无

### 【J000064】强制：严格把控类成员变量和方法的访问控制

类成员与方法访问控制从严，若没有足够理由，不要把实例或类变量声明为公有。通常，实例变量无需显式的设置(set)或获取(gotten)，通常这作为方法调用的边缘效应(side effect)而产生。

一个具有公有实例变量的恰当例子，是类仅作为数据结构，没有行为。

1） 如果不允许外部直接通过new来创建对象，那么构造方法必须是private。
2） 工具类不允许有public或default构造方法。
3） 类非static成员变量并且与子类共享，必须是protected。
4） 类非static成员变量并且仅在本类使用，必须是private。
5） 类static成员变量如果仅在本类使用，必须是private。
6） 若是static成员变量，必须考虑是否为final。
7） 类成员方法只供类内部调用，必须是private。
8） 类成员方法只对继承类公开，那么限制为protected。

<span style="color:orange">说明</span>：任何类、方法、参数、变量，严控访问范围。过于宽泛的访问范围，不利于模块解耦。思考：如果是一个private的方法，想删除就删除，可是一个public的service成员方法或成员变量，删除一下，不得手心冒点汗吗？变量像自己的小孩，尽量在自己的视线内，变量作用域太大，无限制的到处跑，那么你会担心的。

> 检查工具：无

### 【J000065】强制：规范 for 循环中计数器常量的使用

在 `for` 循环中充当计数器值的数字常量，除了 -1、0 和 1 这三个特殊数字之外，禁止直接写在代码里。这是因为直接将常量硬编码在代码中，会使代码变得难以理解和维护。一旦需求发生变化，需要修改这个常量值时，就必须在代码中找到所有使用该常量的地方进行修改，容易遗漏且容易出错。

**正例：**

```java
// 定义一个常量表示循环次数
final int LOOP_TIMES = 10;
for (int i = 0; i < LOOP_TIMES; i++) {
    // 循环体代码
    System.out.println("当前循环次数: " + i);
}
```

**反例：**

```java
for (int i = 0; i < 10; i++) {
    // 循环体代码
    System.out.println("当前循环次数: " + i);
}
```

**特殊情况说明：**

-1、0 和 1 这三个数字是允许直接写在 `for` 循环计数器中的。因为它们是非常基础且常用的数字，在很多情况下，它们的含义清晰明确，不会引起混淆。例如：

```java
// 使用 -1 作为初始值
for (int i = -1; i < LOOP_TIMES; i++) {
    System.out.println("当前值: " + i);
}

// 使用 0 作为初始值，这是最常见的情况
for (int i = 0; i < LOOP_TIMES; i++) {
    System.out.println("当前值: " + i);
}

// 使用 1 作为步长
for (int i = 0; i < LOOP_TIMES; i = i + 1) {
    System.out.println("当前值: " + i);
}
```

> 检查工具：无

### 【J000066】强制：避免在一个语句中给多个变量赋值

因为这样很难读懂。例如：

```java
fooBar.fChar = barFoo.Ichar = 'c'; //避免这样！
```

不要使用内嵌(embedded)赋值运算符试图提高运行时的效率，这是编译器的工作。例如：

```java
d = (a = b + c) + r; //避免这样！
```

应该写成

```java
a = b + c;
d = a + r;
```

> 检查工具：
>
> 1. CheckStyle：应避免在子表达式中赋值。 (11:16) [InnerAssignment]

### 【J000067】推荐：在含有多种运算符的表达式中使用圆括号来明确逻辑边界

一般而言，在含有多种运算符的表达式中使用圆括号来避免运算符优先级问题，是个好方法。即使运算符的优先级对你而言可能很清楚，但对其他人未必如此。你不能假设别的程序员和你一样清楚运算符的优先级。

```java
if (a == b && c == d) //避免这样！
  
if ((a == b) && (c == d)) //推荐这样
```

> 检查工具：无

### 【J000068】推荐：将反复使用的字符串、数字等定义成常量

- 对于一些所有模块都共用的字符串，定义到公共常量类中去。
- 对于模块内共用的一些字符串，定义到模块内部常量类里面去。
- 不要使用一个常量类维护所有常量，要按常量功能进行归类，分开维护。

> 检查工具：无

### 【J000069】强制：尽量通过接口引用对象

优先使用接口而不是类来引用对象。如果有合适的接口类型存在，那么对于参数、返回值、变量和域来说，都应该使用接口类型进行声明。

例如：

```java
List<String> nameList = new ArrayList<String>();
```

如果实现类提供了某个特殊功能不是接口通用约定的，且代码中会依赖这个特殊功能，本规则就不适用。

> 检查工具：
>
> 1. PMD：bestpractices:LooseCoupling

### 【J000070】强制：不使用float和double进行精确数值计算

float和double只能进行 *<u>较为精确</u>* 的 *<u>快速近似</u>* 的计算，并不能提供 *<u>完全精确</u>* 的结果，尤其不适用于 *<u>货币</u>* 计算，因为它们不能精确地表示0.1或者10的任何其它负次方。要进行精确计算就使用 *BigDecimal*、*int* 或者*long* 。

**正例** ：

```java
import java.math.BigDecimal;

public class AccurateCalculationExample {
    public static void main(String[] args) {
        // 使用 BigDecimal 进行精确的小数计算
        BigDecimal num1 = new BigDecimal("0.1");
        BigDecimal num2 = new BigDecimal("0.2");
        BigDecimal sum = num1.add(num2);
        System.out.println("精确计算结果：" + sum);

        // 使用 int 进行精确的整数计算
        int intNum1 = 5;
        int intNum2 = 3;
        int intSum = intNum1 + intNum2;
        System.out.println("精确整数计算结果：" + intSum);

        // 使用 long 进行较大范围的精确整数计算
        long longNum1 = 10000000000L;
        long longNum2 = 20000000000L;
        long longSum = longNum1 + longNum2;
        System.out.println("精确长整数计算结果：" + longSum);
    }
}
```

**反例** ：

```java
public class InaccurateCalculationExample {
    public static void main(String[] args) {
        // 使用 float 进行计算，结果可能不精确
        float floatNum1 = 0.1f;
        float floatNum2 = 0.2f;
        float floatSum = floatNum1 + floatNum2;
        System.out.println("不精确的 float 计算结果：" + floatSum);

        // 使用 double 进行计算，结果可能不精确
        double doubleNum1 = 0.1;
        double doubleNum2 = 0.2;
        double doubleSum = doubleNum1 + doubleNum2;
        System.out.println("不精确的 double 计算结果：" + doubleSum);
    }
}
```

> 检查工具：无

### 【J000071】推荐：尽量避免在循环体内进行try/catch

**说明** ：`try/catch` 块用于捕获和处理异常。然而，将 `try/catch` 块放置在循环体内可能会带来一些性能和代码维护上的问题，除非有明确的逻辑需求或特殊原因，否则应将 `try/catch` 放在循环体外。

在循环体内使用 `try/catch`，会增加每次循环的开销，因为每次迭代时都要检查是否有异常发生以及执行相关的异常处理逻辑。这可能会导致性能下降，特别是在循环次数较多的情况下。

**正例** ：

```java
import java.util.ArrayList;
import java.util.List;

public class TryCatchOutsideLoopExample {
    public static void main(String[] args) {
        List<Integer> numbers = new ArrayList<>();
        numbers.add(1);
        numbers.add(0);
        numbers.add(2);

        try {
            for (int num : numbers) {
                int result = 10 / num;
                System.out.println("Result: " + result);
            }
        } catch (ArithmeticException e) {
            System.out.println("捕获到异常: " + e.getMessage());
        }
    }
}
```

**反例** ：

```java
import java.util.ArrayList;
import java.util.List;

public class TryCatchInsideLoopExample {
    public static void main(String[] args) {
        List<Integer> numbers = new ArrayList<>();
        numbers.add(1);
        numbers.add(0);
        numbers.add(2);

        for (int num : numbers) {
            try {
                int result = 10 / num;
                System.out.println("Result: " + result);
            } catch (ArithmeticException e) {
                System.out.println("捕获到异常: " + e.getMessage());
            }
        }
    }
}
```

在反例中，`try/catch` 块位于循环体内。每次循环都要执行异常检查和处理逻辑，增加了性能开销。

> 检查工具：无

### 【J000072】强制：Object的equals方法容易抛空指针异常，应使用常量或确定有值的对象来调用equals

<span style="color:green">正例</span>："test".equals(object);

<span style="color:red">反例</span>：object.equals("test");

<span style="color:orange">说明</span>：推荐使用java.util.Objects#equals（JDK7引入的工具类）

避免比较的String对象是null而引起空指针异常。

```java
String orgName = orgDAO.selName();
if (orgName.equals(CN_NJ)) { //可能引发NullPointerException，避免这样！
  
}

if (orgName != null && orgName.equals(CN_NJ)) { //OK，但是代码不简洁
  
}

if (CN_NJ.equals(orgName)) { //安全又简洁，推荐这样！
  
}
```

> 检查工具：
>
> 1. PMD：bestpractices:LiteralsFirstComparisons
> 2. CheckStyle：String literal expressions should be on the left side of an equals comparison. (21:32) [EqualsAvoidNull]

### 【J000073】强制：调用String.subString()时先进行长度判断

为了避免在调用 `String.substring()` 方法时因传入的索引参数超出字符串长度范围而引发 `IndexOutOfBoundsException` 异常，在调用该方法之前，必须先对字符串的长度进行判断，确保传入的索引参数在合法范围内。

**正例：**

```java
public class SubstringExample {
    public static void main(String[] args) {
        String str = "Hello, World!";

        // 使用 substring(int beginIndex) 方法
        int beginIndex = 7;
        if (beginIndex <= str.length()) {
            String subStr1 = str.substring(beginIndex);
            System.out.println("使用 substring(int beginIndex) 提取的子串: " + subStr1);
        } else {
            System.out.println("开始索引超出字符串长度，无法提取子串。");
        }

        // 使用 substring(int beginIndex, int endIndex) 方法
        int start = 0;
        int end = 5;
        if (start >= 0 && end <= str.length() && start <= end) {
            String subStr2 = str.substring(start, end);
            System.out.println("使用 substring(int beginIndex, int endIndex) 提取的子串: " + subStr2);
        } else {
            System.out.println("索引参数不合法，无法提取子串。");
        }
    }
}
```

> 检查工具：无

### 【J000074】强制：将数据库表数值类型对应的属性定义成Long类型

数据库表数值类型主键一般为NUMBER(6)或者NUMBER(9)，当是后者时，如果主键值足够大，会超出Integer能够表示的范围，所以要求统一使用Long来定义对应的属性。

> 检查工具：无

### 【J000075】强制：不要使用MD2、MD4、MD5算法来加密敏感数据

由于MD2、MD4、MD5已被认为是不安全的hash算法，因此应禁止使用它们。建议使用SHA256来对密码进行hash处理。

对于非加密的场景，例如仅用于后台使用、构造hash环，可以例外处理。

> 检查工具：无

### 【J000076】强制：优先使用 Spring 封装的 RestTemplate 进行 HTTP 请求

**说明** ：在进行 HTTP 请求时，原生的 HTTP 客户端 API（如 Apache HttpClient 等）虽然功能强大，但使用起来较为复杂，需要开发者手动处理很多细节，例如连接管理、超时设置、异常处理等。如果处理不当，可能会导致一些潜在的问题，像未设置超时时间会使线程长时间阻塞，在高并发场景下可能耗尽系统资源，影响系统的正常运行。而 Spring 框架提供的 `RestTemplate` 对原生 HTTP 客户端进行了封装，简化了 HTTP 请求的操作，它提供了更高级的抽象，能自动处理许多常见的任务，如消息转换、异常处理等，同时也能方便地设置超时时间等参数，提高了代码的可读性和可维护性。

**正例：**

我们可以通过简单地使用ClientHttpRequestFactory来配置*RestTemplate*超时：

> 使用 ZSmart Core R9 框架的产品，框架已经提供了自动配置。

```java
RestTemplate restTemplate = new RestTemplate(getClientHttpRequestFactory());

private ClientHttpRequestFactory getClientHttpRequestFactory() {
    int timeout = 5000;
    RequestConfig config = RequestConfig.custom()
      .setConnectTimeout(timeout)
      .setConnectionRequestTimeout(timeout)
      .setSocketTimeout(timeout)
      .build();
    CloseableHttpClient client = HttpClientBuilder
      .create()
      .setDefaultRequestConfig(config)
      .build();
    return new HttpComponentsClientHttpRequestFactory(client);
}
```

如果不可避免的使用HttpClient的原生API，请妥善处理好超时时间：

```java
CloseableHttpClient httpClient = HttpClients.createDefault();

// 妥善处理超时
RequestConfig requestConfig = RequestConfig.custom()
			.setSocketTimeout(30000)
			.setConnectTimeout(10000)
            .setConnectionRequestTimeout(5000)
			.build();

HttpGet httpGet = new HttpGet("http://localhost/1");
httpGet.setConfig(requestConfig);
CloseableHttpResponse response = httpClient.execute(httpGet, context);
try {
	HttpEntity entity = response.getEntity();
} 
finally {
        if (response != null) {
            EntityUtils.consume(response.getEntity()); // 确保流关闭
            response.close();
        }
    }
```

通常我们要关注以下3个超时时间：

- http.socket.timeout：套接字超时时间，默认0表示无限期等待。
- http.connection.timeout：建立连接超时时间，默认0表示无限期等待。
- http.connection-manager.timeout：从连接池获取连接的等待时间，默认0表示无限期等待。

**反例：**

```java
public class NativeHttpClientExample {
    public static void main(String[] args) {
        // 创建默认配置的 HttpClient 实例，没有关注各种超时配置
        CloseableHttpClient httpClient = HttpClients.createDefault();
        // 创建 GET 请求
        HttpGet httpGet = new HttpGet("https://api.example.com/data");

        try {
            // 执行请求
            CloseableHttpResponse response = httpClient.execute(httpGet);
            try {
                // 获取响应实体
                HttpEntity entity = response.getEntity();
                if (entity != null) {
                    String responseBody = EntityUtils.toString(entity);
                    System.out.println("Response: " + responseBody);
                }
            } finally {
                // 关闭响应
                response.close();
            }
        } catch (IOException e) {
            e.printStackTrace();
        } finally {
            try {
                // 关闭 HttpClient
                httpClient.close();
            } catch (IOException e) {
                e.printStackTrace();
            }
        }
    }
}
```

> 检查工具：无

### 【J000077】强制：内存数据库的事务应当优先提交

当在一个全局事务中有访问多数据库的业务需要时，内存数据库的DML操作应当被放在事务的最后。同时，在最终事务提交(commit)时内存数据库连接应当被优先处理，以此来保证避免产生内存数据库长事务。(常见内存数据库如：Timesten、QMDB等)

> 检查工具：无

### 【J000078】强制：谨慎处理用户输入信息，防止SQL注入，禁止通过字符串拼接的方式生成SQL

**说明** ：在开发过程中，若直接使用用户输入的数据来构造 SQL 语句，可能会遭受 SQL 注入攻击。攻击者可以通过精心构造输入内容，改变 SQL 语句的原有逻辑，从而执行非法操作，如获取敏感数据、修改数据库内容甚至删除数据库等，严重威胁系统的安全性。为了避免此类安全风险，必须严格采用参数绑定的方式来处理用户输入的 SQL 参数，严禁使用字符串拼接的方式来构建 SQL 语句访问数据库。

**正例** ：

```java
// 使用预编译语句进行参数绑定
String sql = "SELECT * FROM users WHERE username = ?";
PreparedStatement preparedStatement = connection.prepareStatement(sql);
preparedStatement.setString(1, userInput);
```

**反例** ：

```java
// 使用字符串拼接构建 SQL 语句，存在 SQL 注入风险
String sql = "SELECT * FROM users WHERE username = '" + userInput + "'";
Statement statement = connection.createStatement();
ResultSet resultSet = statement.executeQuery(sql);
```

> 检查工具：
>
> 1. Spotbugs:Security (Potential SQL Problem)
>    SQL_NONCONSTANT_STRING_PASSED_TO_EXECUTE (Nonconstant string passed to execute or addBatch method on an SQL statement)

### 【J000079】强制：不能将静态变量赋值给局部变量

**说明** ：静态变量是被`static`关键字修饰的成员变量，它属于类本身，在整个进程的生命周期内存在，并且在进程内是共享的，全局都可以访问。如果将静态变量赋值给局部变量，后续对该局部变量进行的操作，由于静态变量的共享特性，实际上会影响到所有引用该静态变量的地方，这就违背了局部变量只在其定义的方法或代码块内有效的约定，可能会导致难以排查的逻辑错误和数据不一致问题。此外，这种做法还会使代码的可读性和维护性变差，增加理解代码逻辑和追踪数据变化的难度。

> 检查工具：无

### 【J000080】强制：所有的覆写方法，必须加@Override注解

<span style="color:orange">说明</span>：getObject()与get0bject()的问题。一个是字母的O，一个是数字的0，加@Override可以准确判断是否覆盖成功。另外，如果在抽象类中对方法签名进行修改，其实现类会马上编译报错。

> 检查工具：
>
> 1. PMD:[MissingOverride](https://docs.pmd-code.org/pmd-doc-7.2.0/pmd_rules_java_bestpractices.html#missingoverride)Annotating overridden methods with @Override ensures at compile time that the method really overrides one, which helps refactoring and clarifies intent.

### 【J000081】强制：相同参数类型，相同业务含义，才可以使用Java的可变参数，避免使用Object

**说明**：Java 的可变参数是 JDK 5 引入的一项特性，它允许方法接受可变数量的参数。不过，使用可变参数时要遵循一定规则，以保证代码的可读性、可维护性和正确性。

首先，可变参数只能用于相同参数类型且具有相同业务含义的情况。这是因为可变参数本质上是将多个同类型的参数封装成数组传递给方法。若参数类型不同或业务含义不同，使用可变参数会让代码逻辑变得混乱，难以理解和维护。

其次，要避免使用 `Object` 作为可变参数类型。`Object` 是所有类的基类，使用它作为可变参数类型会使方法可以接受任意类型的参数，这会丧失类型检查的优势，容易在运行时引发类型转换异常，同时也会降低代码的可读性。

另外，可变参数必须放在参数列表的最后。这是 Java 语法的规定，若不遵循，会导致编译错误。虽然可变参数有一定便利性，但在实际编程中，应尽量少用，因为它可能会使方法签名变得复杂，影响代码的清晰性。

**正例：**

```java
public class VariableArgsExample {
    // 计算多个整数的和，参数类型相同且业务含义一致
    public static int sum(int... numbers) {
        int result = 0;
        for (int num : numbers) {
            result += num;
        }
        return result;
    }

    public static void main(String[] args) {
        int total = sum(1, 2, 3, 4, 5);
        System.out.println("总和: " + total);
    }
}
```

**反例：**

```java
public class BadVariableArgsExample {
    // 错误示例：使用 Object 作为可变参数类型
    public static void printObjects(Object... objects) {
        for (Object obj : objects) {
            System.out.println(obj);
        }
    }

    public static void main(String[] args) {
        printObjects("Hello", 123, true);
    }
}
```

> 检查工具：无

### 【J000082】强制：外部正在调用或者作为二方库依赖的接口，不允许直接修改方法签名，避免对接口调用方产生影响。接口过时必须加@Deprecated注解，并清晰地说明采用的新接口或者新服务是什么

**说明** ：当接口被外部系统调用或者作为二方库被依赖时，接口的稳定性至关重要。接口的方法签名（包括方法名、参数类型和数量、返回值类型等）定义了调用方与被调用方之间的契约。如果随意修改方法签名，会导致调用方的代码无法正常调用，引发编译错误、运行时异常等问题，严重影响系统的正常运行和业务的连续性。因此，为了保证接口调用方的正常使用，严禁对这类接口的方法签名进行修改。

当接口因业务发展或技术升级等原因不再适用时，不应该直接删除或修改其方法签名，而应使用 `@Deprecated` 注解标记该接口为过时。同时，为了帮助调用方顺利过渡到新的接口或服务，需要在注解的说明中清晰地指出可以采用的新接口或者新服务是什么，以便调用方能够及时进行代码迁移。

> 检查工具：无

### 【J000083】强制：不能使用过时的类或方法

<span style="color:orange">说明</span>：接口提供方既然明确是过时接口，那么也有义务同时提供新的接口；作为调用方来说，有义务去考证过时方法的新实现是什么。

> 检查工具：
>
> 1. 可以借助编译器告警，例如：IDEA会提示“'xxx' is deprecated”

### 【J000084】强制：浮点数之间的等值判断，基本数据类型不能用==来比较，包装数据类型不能用equals 来判断

<span style="color:orange">说明</span>：浮点数采用“尾数+阶码”的编码方式，类似于科学计数法的“有效数字+指数”的表示方式。二进制无法精确表示大部分的十进制小数，具体原理参考《码出高效》

**反例：**

```java
float a = 1.0f - 0.9f;
float b = 0.9f - 0.8f;
if (a == b) {
    // 预期进入此代码快，执行其它业务逻辑
    // 但事实上 a==b 的结果为 false
}
Float x = Float.valueOf(a);
Float y = Float.valueOf(b);
if (x.equals(y)) {
    // 预期进入此代码快，执行其它业务逻辑
    // 但事实上 equals 的结果为 false
}
```

<span style="color:green">**正例：**

```java
(1) 指定一个误差范围，两个浮点数的差值在此范围之内，则认为是相等的。
float a = 1.0f - 0.9f;
float b = 0.9f - 0.8f;
float diff = 1e-6f;
if (Math.abs(a - b) < diff) {
    System.out.println("true");
}
(2) 使用 BigDecimal 来定义值，再进行浮点数的运算操作。
BigDecimal a = new BigDecimal("1.0");
BigDecimal b = new BigDecimal("0.9");
BigDecimal c = new BigDecimal("0.8");
BigDecimal x = a.subtract(b);
BigDecimal y = b.subtract(c);
if (x.equals(y)) {
    System.out.println("true");
}
```

> 检查工具：无

### 【J000085】强制：所有的相同类型的包装类对象之间值的比较，全部使用equals方法比较 (浮点数的包装类除外)

**说明**：对于Integer var = ?  在-128至127范围内的赋值，Integer对象是在IntegerCache.cache产生，会复用已有对象，这个区间内的Integer值可以直接使用==进行判断，但是这个区间之外的所有数据，都会在堆上产生，并不会复用已有对象，这是一个大坑，推荐统一使用equals方法进行判断。

```java
Integer a = 12;
Integer b = 12;
System.out.println(a == b); // true
System.out.println(a.equals(b)); // true

Integer c = 1234;
Integer d = 1234;
System.out.println(c == d);  // false
System.out.println(c.equals(d)); // true
```

> 检查工具：
>
> 1. PMD:[CompareObjectsWithEquals](https://docs.pmd-code.org/pmd-doc-7.2.0/pmd_rules_java_errorprone.html#compareobjectswithequals)
> 2. Spotbugs:Correctness (Questionable use of reference equality rather than calling equals) RC_REF_COMPARISON (Suspicious reference comparison)

### 【J000086】强制：为了防止精度损失，禁止使用构造方法 BigDecimal(double) 的方式把 double 值转化为 BigDecimal 对象

**说明**</span>：BigDecimal(double)存在精度损失风险，在精确计算或值比较的场景中可能会导致业务逻辑异常。如：BigDecimal g = new BigDecimal(0.1f); 实际的存储值为：0.10000000149

优先推荐入参为 String 的构造方法，或使用 BigDecimal 的 valueOf 方法，此方法内部其实执行了Double 的 toString，而 Double 的 toString 按 double 的实际能表达的精度对尾数进行了截断。

**正例：**

```java
import java.math.BigDecimal;

public class CorrectBigDecimalConversion {
    public static void main(String[] args) {
        double doubleValue = 0.1;

        // 使用 BigDecimal(String) 构造方法
        BigDecimal bigDecimalFromString = new BigDecimal(String.valueOf(doubleValue));
        System.out.println("使用 BigDecimal(String) 转换结果: " + bigDecimalFromString);

        // 使用 BigDecimal.valueOf(double) 方法
        BigDecimal bigDecimalFromValueOf = BigDecimal.valueOf(doubleValue);
        System.out.println("使用 BigDecimal.valueOf(double) 转换结果: " + bigDecimalFromValueOf);
    }
}
```

**反例:**

```java
import java.math.BigDecimal;

public class IncorrectBigDecimalConversion {
    public static void main(String[] args) {
        double doubleValue = 0.1;
        // 使用 BigDecimal(double) 构造方法，会导致精度损失
        BigDecimal bigDecimalFromDouble = new BigDecimal(doubleValue);
        System.out.println("使用 BigDecimal(double) 转换结果: " + bigDecimalFromDouble);
    }
}
```

> 检查工具：
>
> 1. PMD:[AvoidDecimalLiteralsInBigDecimalConstructor](https://docs.pmd-code.org/pmd-doc-7.2.0/pmd_rules_java_errorprone.html#avoiddecimalliteralsinbigdecimalconstructor)

### 【J000087】强制：明确基本数据类型与包装数据类型的使用标准

1） 【强制】所有的POJO类属性必须使用包装数据类型。
2） 【强制】RPC方法的返回值和参数必须使用包装数据类型。
3） 【推荐】所有的局部变量使用基本数据类型。

说明：POJO类属性没有初值是提醒使用者在需要使用时，必须自己显式地进行赋值，任何NPE问题，或者入库检查，都由使用者来保证。

正例：数据库的查询结果可能是null，因为自动拆箱，用基本数据类型接收有NPE风险。

反例：比如显示成交总额涨跌情况，即正负x%，x为基本数据类型，调用的RPC服务，调用不成功时，返回的是默认值，页面显示为0%，这是不合理的，应该显示成中划线。所以包装数据类型的null值，能够表示额外的信息，如：远程调用失败，异常退出。

> 检查工具：无

### 【J000088】强制：定义DO/DTO/VO等POJO类时，不要设定任何属性默认值

**说明** ：DO（Data Object，数据对象）、DTO（Data Transfer Object，数据传输对象）、VO（View Object，视图对象）等 POJO（Plain Old Java Object）类主要用于数据的存储和传输。为这些类的属性设定默认值可能会带来潜在的风险和问题。当属性被赋予默认值后，在数据处理过程中，可能会掩盖数据未被正确赋值的情况，导致数据不一致。例如，在数据提取时，如果某个属性没有被置入具体值，但由于有默认值，可能会让开发者误以为该属性已经有了有效的数据。在后续的更新操作中，这些默认值可能会被错误地写入数据库或传递到其他系统，从而影响业务逻辑的正确性。

**正例：**

```java
public class UserDO {
    private Long id;
    private String name;
    private Date gmtCreate;
    private Date gmtModified;

    // 提供 getter 和 setter 方法
    ...
}
```

**反例：**

```java
public class UserDO {
    private Long id;
    private String name;
    private Date gmtCreate  = new Date();
    private Date gmtModified  = new Date();

    // 提供 getter 和 setter 方法
    ...
}
```

> 检查工具：无

### 【J000089】强制：合理处理序列化类中 serialVersionUID 字段的修改

**说明** ：当一个类实现了 `Serializable` 接口后，`serialVersionUID` 用于确保在反序列化过程中，序列化和反序列化的类版本一致性。它是一个标识类版本的唯一标识符，在序列化时会与对象数据一起存储，反序列化时会进行比对。

如果在序列化类新增属性时修改了 `serialVersionUID` 字段，即使新属性对反序列化没有实质性影响，也可能导致反序列化失败。因为反序列化时会比较存储的 `serialVersionUID` 和当前类的 `serialVersionUID`，若不一致，Java 虚拟机（JVM）会认为这是两个不同版本的类，从而抛出 `InvalidClassException` 异常。因此序列化类新增属性时，请不要修改`serialVersionUID` 字段，避免反序列化失败；

然而，当类进行完全不兼容的升级时，例如删除了重要属性、修改了属性类型等，旧版本的对象数据可能无法正确反序列化为新版本的类对象。此时，为了避免反序列化混乱，需要修改 `serialVersionUID` 值，让 JVM 识别出这是一个全新版本的类，从而拒绝反序列化旧版本的数据，避免潜在的错误和异常。

> 检查工具：无

### 【J000090】强制：POJO类必须实现 toString 方法

**说明** ：POJO（Plain Old Java Object）类主要用于存储和传输数据。当程序运行过程中出现异常时，为了能够快速定位问题，需要清晰了解相关对象的属性值。而 `toString` 方法可以将对象的属性信息以字符串的形式输出，这样在方法执行抛出异常时，直接调用 POJO 对象的 `toString` 方法，就能方便地查看对象各属性的具体值，极大地提高了问题排查的效率。

另外，当 POJO 类继承自另一个 POJO 类时，在重写 `toString` 方法时需要调用 `super.toString()`，这样可以确保父类的属性信息也能包含在输出结果中，避免遗漏重要信息。

> 检查工具：无

### 【J000091】强制：禁止在 POJO 类中，同时存在对应属性 xxx 的 isXxx()和 getXxx()方法

**说明** ：在 POJO（Plain Old Java Object）类中，通常使用 getter 方法来获取对象属性的值。对于布尔类型的属性，习惯上使用 `isXxx()` 方法来获取其值；而对于其他类型的属性，则使用 `getXxx()` 方法。如果在 POJO 类中同时为同一个属性提供 `isXxx()` 和 `getXxx()` 方法，会造成接口的不一致性和使用上的混淆。

一方面，调用者在使用时可能不清楚应该调用哪个方法来获取属性值，增加了理解和使用的成本。另一方面，在一些框架或工具中，可能会根据约定的 getter 方法名来进行数据绑定、序列化等操作，同时存在两个不同命名的 getter 方法可能会导致这些操作出现异常或不符合预期的结果。

**正例：**

```java
class CorrectPOJO {
    private boolean enabled;

    // 对于布尔类型属性，只使用 isXxx() 方法
    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    private String name;

    // 对于其他类型属性，只使用 getXxx() 方法
    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }
}
```

**反例：**

```java
class IncorrectPOJO {
    private boolean valid;

    // 同时存在 isXxx() 和 getXxx() 方法，违反规范
    public boolean isValid() {
        return valid;
    }

    public boolean getValid() {
        return valid;
    }

    public void setValid(boolean valid) {
        this.valid = valid;
    }
}
```

> 检查工具：
>
> 1. PMD:[BooleanGetMethodName](https://docs.pmd-code.org/pmd-doc-7.2.0/pmd_rules_java_codestyle.html#booleangetmethodname)

### 【J000092】推荐：final 可以声明类、成员变量、方法、以及本地变量，下列情况使用final关键字

1） 不允许被继承的类，如：String类。
2） 不允许修改引用的域对象，如：POJO类的域变量。
3） 不允许被重写的方法，如：POJO类的setter方法。
4） 不允许运行过程中重新赋值的局部变量。
5） 避免上下文重复使用一个变量，使用final描述可以强制重新定义一个变量，方便更好地进行重构。

> 检查工具：无

### 【J000093】推荐：在JDK17以上，使用封闭类（Sealed Classes）来限制类的继承，提高代码的安全性和可维护性

**正例：**

```java
public sealed class Shape permits Circle, Rectangle, Square {}

public final class Circle extends Shape {}
public final class Rectangle extends Shape {}
public abstract class Square extends Shape {}
```

【说明】封闭类可以指定哪些其他类可以继承它，有助于避免不相关的类继承导致的代码混乱。

> 检查工具：无

### 【J000094】强制：谨慎使用 Object 的 clone 方法进行对象拷贝

**说明** ：`Object` 类提供了 `clone` 方法用于创建对象的副本。然而，`Object` 类的 `clone` 方法默认实现的是浅拷贝。浅拷贝意味着只复制对象本身以及对象中的基本数据类型属性，但对于对象中的引用类型属性，仅仅复制引用，而不复制引用指向的实际对象。这就导致原对象和拷贝对象中的引用类型属性会指向同一个内存地址，当其中一个对象修改该引用类型属性时，另一个对象也会受到影响，可能引发数据不一致的问题。

若需要实现深拷贝，即复制对象及其所有引用类型属性所指向的对象，就需要重写 `clone` 方法，并在方法中对每个引用类型属性进行单独的拷贝操作。但重写 `clone` 方法实现深拷贝较为复杂，需要考虑对象的层次结构、引用关系等多方面因素，容易出错。此外，`clone` 方法还依赖于对象所属的类实现 `Cloneable` 接口，否则会抛出 `CloneNotSupportedException` 异常。因此，在实际开发中，应谨慎使用 `Object` 的 `clone` 方法进行对象拷贝。

**正例：

```java
import java.util.ArrayList;
import java.util.List;

// 实现 Cloneable 接口
class DeepCopyExample implements Cloneable {
    private int primitiveField;
    private List<String> referenceField;

    public DeepCopyExample(int primitiveField, List<String> referenceField) {
        this.primitiveField = primitiveField;
        this.referenceField = new ArrayList<>(referenceField);
    }

    @Override
    protected DeepCopyExample clone() throws CloneNotSupportedException {
        DeepCopyExample cloned = (DeepCopyExample) super.clone();
        // 对引用类型属性进行深拷贝
        cloned.referenceField = new ArrayList<>(this.referenceField);
        return cloned;
    }

    public int getPrimitiveField() {
        return primitiveField;
    }

    public List<String> getReferenceField() {
        return referenceField;
    }

    public void setPrimitiveField(int primitiveField) {
        this.primitiveField = primitiveField;
    }

    public void setReferenceField(List<String> referenceField) {
        this.referenceField = referenceField;
    }
}

public class Main {
    public static void main(String[] args) {
        List<String> list = new ArrayList<>();
        list.add("element");
        DeepCopyExample original = new DeepCopyExample(10, list);

        try {
            DeepCopyExample clone = original.clone();
            // 修改原对象的引用类型属性
            original.getReferenceField().add("newElement");

            System.out.println("Original reference field: " + original.getReferenceField());
            System.out.println("Clone reference field: " + clone.getReferenceField());
        } catch (CloneNotSupportedException e) {
            e.printStackTrace();
        }
    }
}
```

**反例：**

```java
import java.util.ArrayList;
import java.util.List;

// 实现 Cloneable 接口
class ShallowCopyExample implements Cloneable {
    private int primitiveField;
    private List<String> referenceField;

    public ShallowCopyExample(int primitiveField, List<String> referenceField) {
        this.primitiveField = primitiveField;
        this.referenceField = referenceField;
    }

    @Override
    protected ShallowCopyExample clone() throws CloneNotSupportedException {
        return (ShallowCopyExample) super.clone();
    }

    public int getPrimitiveField() {
        return primitiveField;
    }

    public List<String> getReferenceField() {
        return referenceField;
    }

    public void setPrimitiveField(int primitiveField) {
        this.primitiveField = primitiveField;
    }

    public void setReferenceField(List<String> referenceField) {
        this.referenceField = referenceField;
    }
}

public class BadMain {
    public static void main(String[] args) {
        List<String> list = new ArrayList<>();
        list.add("element");
        ShallowCopyExample original = new ShallowCopyExample(10, list);

        try {
            ShallowCopyExample clone = original.clone();
            // 修改原对象的引用类型属性
            original.getReferenceField().add("newElement");

            System.out.println("Original reference field: " + original.getReferenceField());
            System.out.println("Clone reference field: " + clone.getReferenceField());
        } catch (CloneNotSupportedException e) {
            e.printStackTrace();
        }
    }
}
```

> 检查工具：无

### 【J000095】强制：优先使用封装的 Logger 输出信息，避免使用 System.out 和 printStackTrace

**说明** ：`System.out` 主要用于将信息输出到标准输出流，通常是控制台。而 `printStackTrace` 是 `Throwable` 类的方法，用于打印异常的堆栈跟踪信息到标准错误流。这两种方式输出的信息缺乏有效的管理和配置能力。无法区分不同级别的日志信息（如调试、信息、警告、错误等），也难以将日志输出到不同的目标位置（如文件、远程服务器等），不利于问题的排查和系统的维护。

> 检查工具：
>
> 1. CheckStyle：avoid use system.out(err,exit) or printStackTrace() (42:0) [RegexpSinglelineJava]
> 2. PMD ：bestpratices:SystemPrintln

### 【J000096】强制：避免空的 try/catch/finally 语句块

**说明：**`try/catch/finally` 语句块是用于处理异常的重要机制。然而，空的 `try/catch/finally` 语句块不仅违背了异常处理的初衷，还会带来一系列问题，影响代码的质量和可维护性。

一个空的 `catch` 块意味着捕获到异常后不进行任何处理，这会导致异常被无声地忽略。异常往往是程序出现问题的信号，忽略异常会掩盖潜在的错误，使得问题难以被发现和定位。当程序在生产环境中出现异常时，由于没有相应的处理和日志记录，开发者很难从代码中获取足够的信息来排查问题，增加了调试的难度和成本。

空的 `finally` 块同样没有实际意义。`finally` 块的主要作用是确保无论 `try` 块中是否发生异常，其中的代码都会被执行，通常用于释放资源，如关闭文件、数据库连接、网络连接等。如果 `finally` 块为空，就失去了其存在的价值，还会让代码变得冗余，降低代码的可读性。

> 检查工具：
>
> 1. PMD:[EmptyCatchBlock](https://docs.pmd-code.org/pmd-doc-7.2.0/pmd_rules_java_errorprone.html#emptycatchblock)
> 2. PMD:[EmptyControlStatement](https://docs.pmd-code.org/pmd-doc-7.2.0/pmd_rules_java_codestyle.html#emptycontrolstatement)

### 【J000097】强制：避免定义未使用的局部变量、参数和私有方法

如果不是特殊原因，不要定义从未使用的局部变量、参数、私有方法。如果以后可能会使用到，可以先注释掉，并加以说明。

> 检查工具：
>
> 1. PMD:[UnusedLocalVariable](https://docs.pmd-code.org/pmd-doc-7.2.0/pmd_rules_java_bestpractices.html#unusedlocalvariable)
> 2. PMD:[UnusedPrivateMethod](https://docs.pmd-code.org/pmd-doc-7.2.0/pmd_rules_java_bestpractices.html#unusedprivatemethod)

### 【J000098】强制：避免使用 "==" 或 "!=" 进行字符串比较

非常常见的低级错误，特别是在同时写JavaScript和Java时，很容易犯这个错误。

**正例：**

```java
public class StringComparisonExample {
    public static void main(String[] args) {
        String str1 = new String("Hello");
        String str2 = new String("Hello");

        // 使用 equals() 方法比较字符串内容
        if (str1.equals(str2)) {
            System.out.println("str1 和 str2 内容相同");
        } else {
            System.out.println("str1 和 str2 内容不同");
        }

        // 使用 equalsIgnoreCase() 方法进行不区分大小写的比较
        String str3 = "hello";
        if (str1.equalsIgnoreCase(str3)) {
            System.out.println("str1 和 str3 内容（不区分大小写）相同");
        } else {
            System.out.println("str1 和 str3 内容（不区分大小写）不同");
        }
    }
}
```

**反例：**

```java
public class BadStringComparisonExample {
    public static void main(String[] args) {
        String str1 = new String("Hello");
        String str2 = new String("Hello");

        // 使用 "==" 比较字符串引用
        if (str1 == str2) {
            System.out.println("str1 和 str2 是同一个对象");
        } else {
            System.out.println("str1 和 str2 不是同一个对象");
        }
    }
}
```

> 检查工具：
>
> 1. PMD:[CompareObjectsWithEquals](https://docs.pmd-code.org/pmd-doc-7.2.0/pmd_rules_java_errorprone.html#compareobjectswithequals)
> 2. PMD:[UseEqualsToCompareStrings](https://docs.pmd-code.org/pmd-doc-7.2.0/pmd_rules_java_errorprone.html#useequalstocomparestrings)

### 【J000099】强制：避免在条件判断表达式里面使用 "=" 进行相等比较

**说明** ：在 Java 中，条件判断表达式（如 `if`、`while` 等语句中的条件部分）通常需要使用比较运算符（如 `==` 用于判断相等，`!=` 用于判断不相等）来确定条件是否成立。而 “`=`” 是赋值运算符，用于将右侧的值赋给左侧的变量。

当在条件判断表达式中错误地使用 “`=`” 时，会将右侧的值赋给左侧的变量，然后以该变量的值作为条件判断的结果。这往往会导致逻辑错误，因为赋值操作的结果可能与预期的条件判断结果不一致。而且这种错误相对隐蔽，不易被发现，可能会在程序运行时产生难以调试和定位的问题。

**正例：**

```java
public class CorrectConditionalCheck {
    public static void main(String[] args) {
        boolean willDelete = false;

        // 使用正确的相等比较运算符 "=="
        if (willDelete == true) {
            System.out.println("willDelete 为 true");
        } else {
            System.out.println("willDelete 为 false");
        }
    }
}
```

**反例：**

```java
public class IncorrectConditionalCheck {
    public static void main(String[] args) {
        boolean willDelete = false;

        // 错误地使用了赋值运算符 "="
        if (willDelete = true) {
            System.out.println("willDelete 被赋值为 true 且条件判断为 true");
        } else {
            System.out.println("这种情况不会发生，因为 willDelete 被赋值为 true");
        }
    }
}
```

> 检查工具：
>
> 1. PMD:[AssignmentInOperand](https://docs.pmd-code.org/pmd-doc-7.2.0/pmd_rules_java_errorprone.html#assignmentinoperand)
> 2. CheckStyle:Inner assignments should be avoided. (9:24) [InnerAssignment]
> 3. Spotbugs:Correctness (Questionable Boolean Assignment) QBA_QUESTIONABLE_BOOLEAN_ASSIGNMENT (Method assigns boolean literal in boolean expression) QuestionableBooleanAssignment (QBA) This method assigns a literal boolean value (true or false) to a boolean variable inside an if or while expression. Most probably this was supposed to be a boolean comparison using ==, not an assignment using =.

### 【J000100】强制：谨慎调用静态的Calendar、DateFormat

以SimpleDateFormat为例，代码经常创建一个静态全局的SimpleDateFormat实例供所有线程使用它的format方法，而实际上SimpleDataFormat的format方法是非线程安全的，这样使用会出现问题。除SimpleDateFormat类外，还有不少 XXXFormat类、XXXCalendar类等对应方法都是非线程安全的。

可以考虑为每个线程创建独立的实例，或者使用线程安全的替代方案（如 `DateTimeFormatter` 替代 `SimpleDateFormat`，`Instant` 和 `ZoneId` 等类配合进行日期和时间操作替代 `Calendar`）。

**正例：**

```java
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

public class ThreadSafeDateExample {
    public static void main(String[] args) {
        // 使用线程安全的 DateTimeFormatter 进行日期格式化
        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
        Instant instant = Instant.now();
        String formattedDate = formatter.format(instant.atZone(ZoneId.systemDefault()));
        System.out.println("格式化后的日期: " + formattedDate);

        // 使用 Instant 和 ZoneId 进行日期和时间操作
        Instant anotherInstant = Instant.ofEpochMilli(System.currentTimeMillis());
        ZoneId zone = ZoneId.of("Asia/Shanghai");
        System.out.println("另一个时间点在上海时区的表示: " + anotherInstant.atZone(zone));
    }
}
```

**反例：**

```java
import java.text.SimpleDateFormat;
import java.util.Date;

public class ThreadUnsafeDateExample {
    private static SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");

    public static void main(String[] args) {
        Thread thread1 = new Thread(() -> {
            Date date = new Date();
            String formattedDate = sdf.format(date);
            System.out.println("线程 1 格式化后的日期: " + formattedDate);
        });

        Thread thread2 = new Thread(() -> {
            Date date = new Date();
            String formattedDate = sdf.format(date);
            System.out.println("线程 2 格式化后的日期: " + formattedDate);
        });

        thread1.start();
        thread2.start();
    }
}
```

> 检查工具：
>
> 1. PMD：[UnsynchronizedStaticFormatter](https://docs.pmd-code.org/pmd-doc-7.2.0/pmd_rules_java_multithreading.html#unsynchronizedstaticformatter)
> 2. PMD：[SimpleDateFormatNeedsLocale](https://docs.pmd-code.org/pmd-doc-7.2.0/pmd_rules_java_errorprone.html#simpledateformatneedslocale)

### 【J000101】强制：在类型转换前进行数据类型检测

**说明：** 类型转换是将一个数据类型转换为另一个数据类型的操作。当进行类型转换时，如果不事先检测目标数据类型，可能会导致运行时异常，如 `ClassCastException`。通过使用 `instanceof` 关键字等方式，可以在运行时判断对象的实际类型，从而避免不恰当的类型转换，提高程序的健壮性。

**正例：**

```java
class Animal {}

class Dog extends Animal {}

class Cat extends Animal {}

public class TypeConversionExample {
    public static void main(String[] args) {
        Animal animal = new Dog();

        // 使用 instanceof 进行类型检测
        if (animal instanceof Dog) {
            Dog dog = (Dog) animal;
            System.out.println("成功将 Animal 转换为 Dog");
        } else if (animal instanceof Cat) {
            Cat cat = (Cat) animal;
            System.out.println("成功将 Animal 转换为 Cat");
        } else {
            System.out.println("无法进行转换");
        }
    }
}
```

**反例：**

```java
class AnotherAnimal {}

class Rabbit extends AnotherAnimal {}

class Bird extends AnotherAnimal {}

public class BadTypeConversionExample {
    public static void main(String[] args) {
        AnotherAnimal animal = new Rabbit();

        // 没有进行类型检测，直接进行转换
        Bird bird = (Bird) animal;
        System.out.println("尝试将 AnotherAnimal 转换为 Bird");
    }
}
```

> 检查工具：
>
> 1. CheckStyle:Correctness (Bad casts of object references) BC_IMPOSSIBLE_CAST (Impossible cast)

### 【J000102】强制：谨慎处理数据类型转换导致溢出或者损失精度

在进行数据类型转换时，必须谨慎对待可能的溢出和精度损失问题。为了避免这些问题，通常可以采取以下措施：

1. **类型检查**：在转换前检查值是否在目标类型的范围内，例如将一个超出 `int` 范围的 `long` 类型数值转换为 `int` 类型时，会发生溢出。
2. **使用合适的数据类型**：根据应用场景，选择能够满足需求的数据类型，避免不必要的转换。
3. **使用高精度数据类型**：在需要高精度计算时，尽量使用 `BigDecimal` 或者其他高精度类型。

**正例：**

```java
public class ProperTypeConversionExample {
    public static void main(String[] args) {
        // 类型检查示例
        long largeNumber = 2_147_483_648L; // 超出 int 范围
        if (largeNumber >= Integer.MIN_VALUE && largeNumber <= Integer.MAX_VALUE) {
            int num = (int) largeNumber;
            System.out.println("转换后的整数: " + num);
        } else {
            System.out.println("数值超出 int 范围，无法安全转换");
        }

        // 使用合适数据类型示例
        double decimal = 123.45;
        // 这里可以根据实际需求决定是否转换为整数
        // 如果不需要整数，保持 double 类型
        System.out.println("原始的小数: " + decimal);

        // 使用高精度数据类型示例
        java.math.BigDecimal amount1 = new java.math.BigDecimal("123.456789");
        java.math.BigDecimal amount2 = new java.math.BigDecimal("987.654321");
        java.math.BigDecimal sum = amount1.add(amount2);
        System.out.println("高精度计算的结果: " + sum);
    }
}
```

**反例：**

```java
public class BadTypeConversionExample {
    public static void main(String[] args) {
        // 溢出示例
        long largeNumber = 2_147_483_648L; // 超出 int 范围
        int num = (int) largeNumber;
        System.out.println("错误：转换后的整数（发生溢出）: " + num);

        // 精度损失示例
        double decimal = 123.45;
        int intValue = (int) decimal;
        System.out.println("错误：转换后的整数（精度损失）: " + intValue);

        // 未使用高精度数据类型示例（假设用于金融计算）
        double price1 = 123.456789;
        double price2 = 987.654321;
        double total = price1 + price2;
        System.out.println("错误：未使用高精度类型，计算结果可能不准确: " + total);
    }
}
```

> 检查工具：无

### 【J000103】强制：使用 System.getProperty("line.separator") 写入换行符

**说明：** 在文件写入操作时，常常需要插入换行符来格式化文本内容。不同的操作系统使用不同的换行符表示：在 Linux/Unix 以及部分新版本的 Mac OS 系统中，换行符是 `\n`；在旧版本的 Mac OS 系统中，换行符是 `\r`；而在 Windows 系统中，换行符是 `\r\n`。

为了确保程序的跨平台兼容性，应该使用 `System.getProperty("line.separator")` 方法来获取当前操作系统的换行符。该方法会根据运行程序的操作系统返回相应的换行符表示，从而保证在不同操作系统上生成的文件都具有正确的换行格式。

**正例：**

```java
import java.io.BufferedWriter;
import java.io.FileWriter;
import java.io.IOException;

public class CrossPlatformLineSeparatorExample {
    public static void main(String[] args) {
        String filePath = "test.txt";
        try (BufferedWriter writer = new BufferedWriter(new FileWriter(filePath))) {
            String line1 = "这是第一行";
            String line2 = "这是第二行";
            String lineSeparator = System.getProperty("line.separator");

            writer.write(line1);
            writer.write(lineSeparator);
            writer.write(line2);

            System.out.println("文件写入成功，已使用系统换行符");
        } catch (IOException e) {
            System.out.println("文件写入失败: " + e.getMessage());
        }
    }
}
```

**反例：**

```java
import java.io.BufferedWriter;
import java.io.FileWriter;
import java.io.IOException;

public class BadLineSeparatorExample {
    public static void main(String[] args) {
        String filePath = "test.txt";
        try (BufferedWriter writer = new BufferedWriter(new FileWriter(filePath))) {
            String line1 = "这是第一行";
            String line2 = "这是第二行";
            // 错误：直接使用 \n 作为换行符，可能不兼容所有操作系统
            String lineSeparator = "\n";

            writer.write(line1);
            writer.write(lineSeparator);
            writer.write(line2);

            System.out.println("文件写入成功，但换行符可能不兼容");
        } catch (IOException e) {
            System.out.println("文件写入失败: " + e.getMessage());
        }
    }
}
```

> 检查工具：无

### 【J000104】强制：禁止内外层循环使用相同的遍历变量

**说明：** 为了确保代码的正确性和可读性，在编写嵌套循环时，每个循环都应该使用独立的遍历变量，使得各个循环的逻辑清晰独立，互不干扰。

**正例：**

```java
for (int i = 0; i < list1.size(); i++) {
    for (int k = 0; k < list2.size(); k++) {
        // 进行一些操作
    }
}
```

**反例：**

```java
for (int i = 0; i < list1.size(); i++) {
    for (i = 0; i < list2.size(); i++) {
        // 进行一些操作
    }
}
```

> 检查工具：
>
> 1. PMD:[AvoidReassigningLoopVariables](https://docs.pmd-code.org/pmd-doc-7.2.0/pmd_rules_java_bestpractices.html#avoidreassigningloopvariables)

### 【J000105】强制：避免变量在使用前被另一个赋值覆盖

此项检查指出了变量值在赋值后从不使用的情况，即：

- 变量在赋值后从不被读取
- 值总是在下一个变量读取前被另一个赋值覆盖
- 变量初始值设定项是冗余的（出于上述两个原因之一）

**反例：**

```java
public class UnusedAssignmentDemo {
    private static final ZSmartLogger LOGGER = ZSmartLogger.getLogger(UnusedAssignmentDemo.class);
    public static void main(String[] args) {
        String greeting;
        if ("1".equals(String.valueOf(3 - 2))) {
            // 下面一行的赋值会被后面的赋值覆盖，要避免这样
            greeting = "This line is unused Assignment!";
        }
        greeting = "Hello world!";
        LOGGER.debug(greeting);
    }
}

```

> 检查工具：
>
> 1. PMD:[UnusedAssignment](https://docs.pmd-code.org/pmd-doc-7.2.0/pmd_rules_java_bestpractices.html#unusedassignment)

### 【J000106】强制：禁止使用字符串或者数字运算的方式处理日期

对日期的处理应当使用成熟的工具包，例如 java.util.Calendar ,org.apache.commons.lang3.time.DateUtils ,禁止使用自定义算法，避免由于没有充分考虑夏令时或者闰年因素导致的问题。
例如：因为2000年是闰年，所以2000/02/29是一个合法的日期，如果增加一年，通过年份增加再拼接的方式会得到
2001/02/29，这是一个非法的日期，在某些场景下会导致解析失败。

**正例**

```java
int year = 2000;
// 月份从0开始计算，month = 1 表示 2月
int month = 1;
int date = 29;
int yearAmount = 1;
calendar = Calendar.getInstance();
calendar.set(year,month,date);
Date yearAmountDate = DateUtils.addYears(calendar.getTime(), yearAmount);
```

**反例**

```java
public class BadDateHandlingExample {
    public static void main(String[] args) {
        int year = 2000;
        int month = 2;
        int date = 29;
        int yearAmount = 1;

        // 使用字符串拼接增加年份
        String oldDate = year + "/" + month + "/" + date;
        int newYear = year + yearAmount;
        String newDate = newYear + "/" + month + "/" + date;

        System.out.println("增加一年后的日期: " + newDate);
        // 这里得到的 2001/2/29 是非法日期
    }
}
```

> 检查工具：无

### 【J001061】推荐：避免使用已经过时的技术或者组件

> :warning: 故障警示! 严重生产故障：[3790344](https://zmp.iwhalecloud.com/hppd/queryFauDtl.action?faultId=3790344) 某项目为实现图像缩放功能，引入已过时的 AWT（Abstract Window Toolkit）组件。由于该组件已多年停止维护，存在大量未修复 BUG 及兼容性缺陷，在高并发业务场景下，出现业务进程概率性异常中断与闪退问题，直接影响生产业务连续性，造成严重业务损失。

为避免因技术选型不当引入隐性风险，保障系统长期稳定运行与可维护性，需遵循 “优先选用活跃演进技术，逐步淘汰过时组件” 的核心原则：

1. 对于新增业务代码，严禁使用已明确停止维护、不再演进的技术或组件，必须选型当前行业主流、社区活跃且具备长期维护计划的替代方案；
2. 对于存量历史应用中已使用的过时技术/组件，需制定明确的升级迭代计划，分阶段、分业务场景完成技术替换，降低历史技术债务带来的潜在风险。

> 常见过时技术/组件包括但不限于：AWT、Swing、Applet、CORBA、EJB、RMI 等。建议在技术选型之前，广泛查阅官方文档、行业技术报告及社区评价，谨慎评估技术的活跃度、维护周期及安全风险。

同时需避免 “为单一 API 引入庞大组件” 的情况，例如仅为使用某个工具类而引入完整的重型框架，以免增加项目的依赖复杂度和隐性维护成本。

**正例**
- **数据处理类场景**：选择 `Apache Commons`（如`commons-lang3`用于字符串处理、`commons-io`用于 `IO `操作）、`Google Guava`（如集合工具、缓存组件），此类工具轻量、API 设计友好，且社区维护活跃；
- **图像处理场景**：替换 `AWT `为 `ImageIO`（Java 原生，维护稳定）、`Thumbnails`（轻量级图像缩放组件）；
- **分布式调用场景**：替换 `CORBA`/`RMI `为 `Dubbo`、`Spring Cloud`，支持跨语言调用、高可用部署，适配微服务架构；
- **UI 开发场景**：替换 `Swing`/`Applet `为 `Vue.js`、`React`、`JavaFX`，兼顾用户体验与技术生态。

**反例**
- **工具类随意引入**：例如实现字符串非空判断时，未评估组件活跃度，随便引入某小众开源项目的`StringUtils`（可能存在未修复 BUG，且后续无维护）；
- **为单一功能引入重型框架**：例如仅需使用 “日期时间格式化” 功能，却引入完整的Joda-Time框架（实际Java 8+原生`java.time`包已能满足需求，且无需额外依赖）；

> 检查工具：无

# 性能优化 (Performance Optimization)

## 内存管理

### 【J000107】推荐：尽早释放无用对象的引用

一般情况下都是让对象在退出活动域（scope）后自动设置成null被回收，但对一些复杂的对象，例如数组、队列、树等，可能存在较为复杂的引用关系，GC回收效率一般较低，尽早将其赋值为null可以加速内存回收。

**正例：**

```java
public class EarlyReleaseExample {
    public static void main(String[] args) {
        // 创建一个复杂对象 - 数组列表
        List<String> complexList = new ArrayList<>();
        for (int i = 0; i < 1000; i++) {
            complexList.add("Element " + i);
        }

        // 使用该列表进行一些操作
        // 当该列表不再使用时，尽早释放引用
        complexList = null;

        // 后续代码可以继续执行其他任务
        System.out.println("继续执行其他任务...");
    }
}
```

**反例** ：

```java
public class BadEarlyReleaseExample {
    public static void main(String[] args) {
        // 创建一个复杂对象 - 数组列表
        List<String> complexList = new ArrayList<>();
        for (int i = 0; i < 1000; i++) {
            complexList.add("Element " + i);
        }

        // 使用该列表进行一些操作
        for (String element : complexList) {
            System.out.println(element);
        }

        // 错误做法：未及时释放引用，即使后续不再使用该列表
        // 此时复杂对象的引用依然存在，GC 可能无法及时回收内存
        // 后续代码可以继续执行其他任务
        System.out.println("继续执行其他任务...");
    }
}
```

> 检查工具：无

### 【J000108】强制：避免使用 System.gc() 强制进行内存回收

**说明** ：`System.gc()` 方法的作用是建议 JVM 进行一次垃圾回收操作，但这仅仅是一个建议，JVM 并不一定会立即响应。而且，频繁调用 `System.gc()` 会带来诸多负面影响。JVM 的垃圾回收算法是经过精心设计和优化的，它会综合考虑内存使用情况、对象生命周期等多种因素来选择最佳的回收时机。当手动调用 `System.gc()` 时，会干扰 JVM 原本的垃圾回收策略，可能导致在不恰当的时机进行垃圾回收。

垃圾回收操作本身是有一定开销的，它需要暂停应用程序的执行，遍历对象图，标记和清除不再使用的对象。如果在不恰当的时机进行垃圾回收，会增加系统内存回收的最终时间，导致应用程序出现卡顿现象，降低系统的整体性能。此外，过度依赖 `System.gc()` 还可能掩盖代码中存在的内存泄漏问题，使得开发者难以发现和解决潜在的内存管理问题。

> 检查工具：
>
> 1. PMD:[DoNotCallGarbageCollectionExplicitly](https://docs.pmd-code.org/pmd-doc-7.2.0/pmd_rules_java_errorprone.html#donotcallgarbagecollectionexplicitly)

### 【J000109】强制：尽量避免在类的构造器中创建、初始化大量对象

主要是为了避免在调用其子类的构造器时造成不必要的内存消耗。应尽量将对象的创建和初始化操作推迟到真正需要使用这些对象的时候进行，遵循 “延迟初始化” 的原则，这样可以有效减少内存的浪费，提高系统的性能。

> 检查工具：无

### 【J000110】强制：JDBC结果集大小应当加以限制

> 此规范有必考题。

> :warning: 故障警示! 严重生产故障：[3713022](https://zmp.iwhalecloud.com/hppd/queryFauDtl.action?faultId=3713022)。某项目应用一次性加载了超400万的结果集，引发了OOM，导致核心业务积压。

默认情况JDBC不限制返回的结果集大小，这可能会导致内存波动，严重时甚至出现内存溢出(OOM)的现象。可以采用SQL的LIMIT子句(MySQL)或rownum子句(Oracle)限定行数的最大值，也可以通过数据访问框架提供的能力加以限制。

例如：

- Spring JdbcTemplate的 setMaxRows方法

  (参考: https://docs.spring.io/spring-framework/docs/3.2.0.M1_to_3.2.0.M2/Spring%20Framework%203.2.0.M2/org/springframework/jdbc/core/JdbcTemplate.html#setMaxRows(int))

- ZSmart CORE (R9) 框架的 ftf.sql.limit-result-set=150

  (参考: http://ftf-r9-coredocuments.ftf.svc.tb.zsmart.com/07/Development_Specification/06/)

- ZSmart CORE (V8) 框架的 db_fetch_limit

  (参考: ZSMART_HOME/etc/defined/system.def)

> 检查工具：无

### 【J000111】强制：避免将过大的文件一次性加载到内存中

> 此规范有必考题。

> :warning: 故障警示! 严重生产故障：[3695958](https://zmp.iwhalecloud.com/hppd/queryFauDtl.action?faultId=3695958)。某项目应用因为处理大文件时，将整个文件读取到内存中的 List 导致内存占用过高，引发订单处理性能下降的严重生产故障。

在处理文件时，应预先检查文件的大小，避免将过大的文件一次性加载到内存中。建议设置一个合理的文件大小阈值，具体的阈值应根据应用场景和服务器配置进行调整。

如果不可避免有超大文件的处理场景，应采用流式处理方式，逐行或分块读取文件内容，避免一次性将整个文件加载到内存中。同时在文件处理过程中，应妥善处理可能发生的异常情况，如文件读取失败、内存溢出等，并提供相应的错误日志和恢复策略。在文件处理完成后，应及时释放相关资源，如关闭文件流、释放缓存等，以避免资源泄漏。在开发过程中，应对文件处理功能进行性能测试，确保在处理大文件时系统的性能和稳定性。在用户界面上，应提供明确的提示信息，告知用户文件大小的限制，并在用户尝试上传或处理超过限制的文件时给予警告。

> 检查工具：无

### 【J000112】强制：确保 SQL 拼装时查询条件有效性，避免大表扫描

> 此规范有必考题。

> :warning: 故障警示! 严重生产故障：3544304、31154605。国际与国内项目均出现过因 SQL 拼装时查询条件处理不当，致使全表扫描、慢 SQL，甚至内存溢出的严重生产故障，虽实现机制有所差异，但故障现象一致。

在使用数据持久化框架（如：Mybatis、或者国际V8 CORE的SQL服务）时，若涉及拼装 SQL 语句：

1. 针对使用了一个或多个条件参数的场景，务必提前考量所有条件参数均不生效的状况，因为这极有可能引发对大表的全表扫描，或是产生超大结果集，最终导致内存溢出等生产事故。开发人员需要进行严谨的测试与验证，模拟各种条件参数的组合情况，确认是否存在潜在风险。
2. 倘若仅有一个参数，且该参数为必传参数，切勿将其设置为条件参数。这种做法能从根源上杜绝因参数缺失而导致意外全表查询的隐患。

在代码评审环节，需着重关注此类 SQL 拼装代码；单元测试用例也应覆盖各种条件参数的生效与失效场景，以此保障代码质量，避免出现类似的性能瓶颈与故障，维护系统稳定高效运行。

> 检查工具：无

### 【J000113】推荐：任何数据结构的构造或初始化，都应指定大小，避免数据结构无限增长吃光内存

**说明**：许多数据结构（如 `ArrayList`、`HashMap`、`HashSet` 等）在创建时如果不指定初始大小，它们会根据元素的添加自动调整大小。虽然这种自动调整大小的机制提供了一定的便利性，但在某些情况下可能会带来问题。

当数据结构不断添加元素时，自动调整大小可能会涉及到频繁的内存分配和数据迁移操作。例如，`ArrayList` 在容量不足时会创建一个更大的数组，并将原数组中的元素复制到新数组中。如果数据结构的增长没有限制，且应用程序持续向其中添加元素，最终可能会导致内存被耗尽，引发 `OutOfMemoryError` 异常。

为了避免这种情况，在构造或初始化数据结构时，应根据实际需求合理指定其初始大小。这样可以减少内存分配和数据迁移的次数，提高程序的性能和稳定性。同时，也能更好地控制数据结构的内存占用，避免因数据结构无限增长而导致的内存问题。

**正例：**

```java
import java.util.ArrayList;
import java.util.HashMap;

public class SpecifySizeExample {
    public static void main(String[] args) {
        // 预先知道大概需要存储 100 个元素，指定 ArrayList 的初始大小
        ArrayList<String> list = new ArrayList<>(100);
        for (int i = 0; i < 80; i++) {
            list.add("Element" + i);
        }

        // 预计有 50 个键值对，指定 HashMap 的初始大小
        HashMap<Integer, String> map = new HashMap<>(50);
        for (int i = 0; i < 40; i++) {
            map.put(i, "Value" + i);
        }
    }
}
```

**反例：**

```java
import java.util.ArrayList;
import java.util.HashMap;

public class BadSizeExample {
    public static void main(String[] args) {
        // 未指定大小，ArrayList 会自动扩容
        ArrayList<String> list = new ArrayList<>();
        for (int i = 0; i < 1000000; i++) {
            list.add("Element" + i);
            // 随着元素不断添加，可能会频繁扩容，消耗大量内存
        }

        // 未指定大小，HashMap 会自动调整大小
        HashMap<Integer, String> map = new HashMap<>();
        for (int i = 0; i < 500000; i++) {
            map.put(i, "Value" + i);
            // 可能会导致大量的内存分配和数据迁移操作
        }
    }
}
```

在反例中，`ArrayList` 和 `HashMap` 在创建时没有指定初始大小。当大量元素被添加时，它们会不断自动扩容，可能导致频繁的内存分配和数据迁移，增加内存消耗和性能开销，甚至可能引发内存不足的问题。

> 检查工具：无

## 集合类

### 【J100114】强制：涉及多线程并发读写的场景，必须选用线程安全的集合类

在多线程环境（存在并发读写）的场景下，必须使用线程安全的集合类或基础组件，以确保数据的原子性、可见性和正确性。

**线程安全的集合类：**

早期同步类

* List ：`Vector`、`Stack`（`Stack` 继承自 `Vector`）
* Map ：`Hashtable`

并发包中的类

* List ：`CopyOnWriteArrayList`
* Set ：`CopyOnWriteArraySet`、`ConcurrentSkipListSet`
* Map ：`ConcurrentHashMap`、`ConcurrentSkipListMap`
* Queue ：`ConcurrentLinkedQueue`、`ConcurrentLinkedDeque`、`ArrayBlockingQueue`、`LinkedBlockingQueue`、`PriorityBlockingQueue`等

> 检查工具：无

### 【J200114】推荐：不涉及多线程同步问题时，尽量选用非线程安全的集合类

不涉及多线程同步问题时，使用非线程安全的集合类，可以规避不必要的加锁开销，具有更好的性能。

**非线程安全的集合类：**

* List ：`ArrayList`、`LinkedList`
* Set ：`HashSet`、`TreeSet`、`LinkedHashSet`
* Map ：`HashMap`、`TreeMap`、`LinkedHashMap`

> 检查工具：无

### 【J000115】推荐：合理选择 ArrayList 和 LinkedList

在列表中进行随机查找，使用ArrayList速度更快；在列表任意位置进行插入、删除，使用LinkedList速度更快。
优先使用ArrayList，然后再考虑使用LinkedList。但如果预先可以知道数据大小，则尽量使用数组。

> 检查工具：无

### 【J000116】推荐：为 ArrayList 设置初始化容量

**说明** ：`ArrayList` 是一个动态数组，它可以根据需要自动调整大小。当向 `ArrayList` 中添加元素时，如果当前数组的容量不足以容纳新元素，`ArrayList` 会自动进行扩容操作。扩容操作涉及创建一个更大的新数组，并将原数组中的元素复制到新数组中，这个过程会带来一定的性能开销。

当处理已知容量的较大数组时，如果不提前设置 `ArrayList` 的初始容量，`ArrayList` 会频繁地进行扩容操作，这会导致大量的内存分配和元素复制，从而显著降低程序的性能。因此，为了避免这种不必要的性能消耗，应该在创建 `ArrayList` 时，根据实际需要存储的元素数量，使用 `ensureCapacity()` 方法或者构造函数来设置其初始容量。

**正例** ：

```java
public class ArrayListCapacityExample {
    public static void main(String[] args) {
        // 已知需要存储的元素数量
        int expectedSize = 10000;

        // 方式一：使用构造函数设置初始容量
        List<String> listWithCapacity = new ArrayList<>(expectedSize);
        for (int i = 0; i < expectedSize; i++) {
            listWithCapacity.add("Element " + i);
        }

        // 方式二：使用 ensureCapacity() 方法设置容量
        List<String> anotherList = new ArrayList<>();
        anotherList.ensureCapacity(expectedSize);
        for (int i = 0; i < expectedSize; i++) {
            anotherList.add("Element " + i);
        }
    }
}
```

**反例** ：

```java
import java.util.ArrayList;
import java.util.List;

public class BadArrayListCapacityExample {
    public static void main(String[] args) {
        // 已知需要存储的元素数量
        int expectedSize = 10000;

        // 未设置初始容量
        List<String> listWithoutCapacity = new ArrayList<>();
        for (int i = 0; i < expectedSize; i++) {
            listWithoutCapacity.add("Element " + i);
        }
    }
}
```

在反例中，由于没有设置 `ArrayList` 的初始容量，在添加元素的过程中，`ArrayList` 会多次进行扩容操作，导致性能下降。而正例中，通过构造函数或者 `ensureCapacity()` 方法提前设置了初始容量，避免了不必要的扩容操作，提高了程序的性能。

> 检查工具：无

### 【J000117】推荐：集合初始化时，指定集合初始值大小

**说明** ：HashMap 使用 HashMap(int initialCapacity) 初始化, Arraylist使用ensureCapacity()方法设置ArrayList的容量,在处理已知容量的较大数组时可以避免ArrayList自动扩容带来的性能消耗。

**正例** ：initialCapacity = (需要存储的元素个数 / 负载因子) + 1。注意负载因子（即 loader factor）默认为 0.75，如果暂时无法确定初始值大小，请设置为 16（即默认值）。

**反例** ：HashMap 需要放置 1024 个元素，由于没有设置容量初始大小，随着元素不断增加，容量 7 次被迫扩大，resize 需要重建 hash 表，严重影响性能。

> 检查工具：无

### 【J000118】推荐：使用 entrySet 遍历 Map 类集合 KV，而不是 keySet 方式进行遍历

**说明** ：keySet 其实是遍历了 2 次，一次是转为 iterator 对象，另一次是从 hashMap 中取出 key 所对应的 value。而 entrySet 只是遍历了一次就把 key 和 value 都放到了 entry 中，效率更高。如果是 JDK8，使用 Map.forEach 方法。

**正例** ：values()返回的是 V 值集合，是一个 list 集合对象；keySet()返回的是 K 值集合，是一个 Set 集合对象；entrySet()返回的是 K-V 值组合集合。

> 检查工具：无

### 【J000119】推荐：利用 Set 元素唯一的特性，可以快速对集合进行去重操作，避免使用 List 的contains 方法进行遍历、对比、去重操作

**说明：** 当需要对集合中的元素进行去重操作时，我们可以采用不同的方法。`List` 是一种有序的集合，它允许存储重复的元素。如果使用 `List` 的 `contains` 方法来进行去重，需要遍历 `List` 中的每个元素，并且对每个元素都调用 `contains` 方法进行检查，判断该元素是否已经存在于 `List` 中。在处理大规模数据时，性能会非常低下。

而 `Set` 是一种不允许存储重复元素的集合，它的实现类（如 `HashSet`、`TreeSet` 等）利用了哈希表或红黑树等数据结构，能够快速判断一个元素是否已经存在于集合中。将需要去重的元素添加到 `Set` 中时，`Set` 会自动忽略重复的元素，从而实现去重的目的。

**正例：**

```java
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public class SetDeduplicationExample {
    public static void main(String[] args) {
        List<Integer> listWithDuplicates = new ArrayList<>();
        listWithDuplicates.add(1);
        listWithDuplicates.add(2);
        listWithDuplicates.add(2);
        listWithDuplicates.add(3);
        listWithDuplicates.add(3);
        listWithDuplicates.add(3);

        // 使用 Set 进行去重
        Set<Integer> set = new HashSet<>(listWithDuplicates);
        List<Integer> listWithoutDuplicates = new ArrayList<>(set);

        System.out.println("去重前的列表: " + listWithDuplicates);
        System.out.println("去重后的列表: " + listWithoutDuplicates);
    }
}
```

**反例：**

```java
import java.util.ArrayList;
import java.util.List;

public class ListDeduplicationExample {
    public static void main(String[] args) {
        List<Integer> listWithDuplicates = new ArrayList<>();
        listWithDuplicates.add(1);
        listWithDuplicates.add(2);
        listWithDuplicates.add(2);
        listWithDuplicates.add(3);
        listWithDuplicates.add(3);
        listWithDuplicates.add(3);

        List<Integer> listWithoutDuplicates = new ArrayList<>();
        for (Integer element : listWithDuplicates) {
            if (!listWithoutDuplicates.contains(element)) {
                listWithoutDuplicates.add(element);
            }
        }

        System.out.println("去重前的列表: " + listWithDuplicates);
        System.out.println("去重后的列表: " + listWithoutDuplicates);
    }
}
```

> 检查工具：无

## String的优化

### 【J000120】强制：合理使用字符串连接方式

* 对于一次性初始化且后面不需要修改的较长字符串**直接使用**+操作符连接。例如：

```java
String tag = "a" + "b" + "c"; //这样是OK的
```

* 对于中间夹有变量的、需要动态连接的字符串，尤其是在循环内部连接字符串或者存在大量的连接操作时，**必须使用**`StringBuilder`或者`StringBuffer`而不是`+`操作符。使用`+`操作符进行大量的连接操作会非常慢。

```java
String tag = "a" + varB + "c"; //避免这样！

String text = "";
for(int i=0; i<size; i++){
    	text += …………; //避免这样
}
```

Java 1.5发行版本中新增加了非同步的StringBuilder类，用于补充同步的StringBuffer类，在多线程环境下推荐使用StringBuffer类。一般情况下两者性能差异不大，在100万次循环下，StringBuilder也只快了几十毫秒。

PS:注意的是**不要混用** StringBuilder/StringBuffer 和+操作符：

```Java
StringBuilder builder = new StringBuilder(10);
for(int i=0; i<size; i++) {
    builder.append("line " + i);			//避免这样
    builder.append("line ").append(i);		//推荐这样
}
```

<span style="color:orange">说明</span>：反编译出的字节码文件显示每次循环都会new出一个StringBuilder对象，然后进行append操作，最后通过toString方法返回String对象，造成内存资源浪费。

> 检查工具：
>
> 1. PMD：performance:usestringbufferforstringappends,[link](https://docs.pmd-code.org/pmd-doc-7.2.0/pmd_rules_java_performance.html#usestringbufferforstringappends)

### 【J000121】推荐：在JDK15以上，推荐使用字符串文本块（Text Blocks）来编写多行字符串，提高代码的可读性和维护性

【说明】字符串文本块通过三个双引号（"""）包围，允许字符串跨多行而无需转义。

**正例：**

```java
String json = """
                {
                  "url": "http://127.0.0.1:8444/emergency/recovery/packageconfigurationerror/confirmCostAccuracy", 
                  "data": {},
                  "output_instructions": ""
                }
                """;
```

> 检查工具：无

### 【J000122】强制：优先使用toCharArray()遍历字符

可以使用charAt()方法取得某个特定位置的字符。但若想遍历所有字符，通过toCharArray()方法先取得字符数组，在对数组进行遍历会有更好的性能。这是因为 `charAt()` 方法在每次调用时都会进行边界检查，以确保指定的索引在字符串的有效范围内，而边界检查操作会带来一定的性能开销。

**正例：**

```java
public class ToCharArrayTraversal {
    public static void main(String[] args) {
        String str = "Hello, World!";
        char[] charArray = str.toCharArray();
        for (char c : charArray) {
            System.out.print(c + " ");
        }
    }
}
```

**反例：**

```java
public class CharAtTraversal {
    public static void main(String[] args) {
        String str = "Hello, World!";
        for (int i = 0; i < str.length(); i++) {
            char c = str.charAt(i);
            System.out.print(c + " ");
        }
    }
}
```

> 检查工具：无

### 【J000123】强制：避免重复创建字符串对象

**说明：** `String` 类是不可变对象，即一旦创建，其值不能被修改。当我们创建字符串对象时，有两种常见的方式：使用 `new String()` 构造函数和直接使用字符串字面量。

使用 `new String()` 构造函数会在堆内存中创建一个新的字符串对象，即使字符串的内容相同，每次调用 `new String()` 都会创建一个新的实例。而使用字符串字面量（如 `"Hello"`）时，Java 会首先检查字符串常量池中是否已经存在该字符串。如果存在，则直接返回常量池中的引用；如果不存在，则在常量池中创建该字符串对象，并返回其引用。这样可以避免重复创建相同内容的字符串对象，节省内存空间。

因此，为了提高内存使用效率，避免不必要的内存开销，应优先使用字符串字面量来创建字符串对象，而不是使用 `new String()` 构造函数。

```java
String str = new String("Hello"); //避免这样
String str = "Hello"; //而是这样
```

> 检查工具：
>
> 1. PMD:[StringInstantiation](https://docs.pmd-code.org/pmd-doc-7.2.0/pmd_rules_java_performance.html#stringinstantiation) : Avoid instantiating String objects; this is usually unnecessary since they are immutable and can be safely shared.

## 运行效率

### 【J000124】强制：在使用正则表达式时，利用好其预编译功能，可以有效加快正则匹配速度

**说明：**正则表达式的使用常常借助 `Pattern` 和 `Matcher` 类。`Pattern` 类代表编译好的正则表达式，`Matcher` 类则用于对输入字符串进行匹配操作。每次调用 `Pattern.compile()` 方法时，Java 会对传入的正则表达式字符串进行解析和编译，将其转换为内部的状态机形式，这个过程是比较耗时的。

要是在方法体内频繁调用 `Pattern.compile()` 来编译相同的正则表达式，就会重复进行编译操作，造成不必要的性能开销。而预编译正则表达式，也就是把 `Pattern` 对象的创建放在方法体外，仅编译一次，之后在方法内多次使用这个预编译好的 `Pattern` 对象，能够显著提升正则匹配的速度。

**正例：**

```java
import java.util.regex.Matcher;
import java.util.regex.Pattern;

// 预编译正则表达式，放在类的静态成员位置
private static final Pattern EMAIL_PATTERN = Pattern.compile("^[a-zA-Z0-9_+&*-]+(?:\\.[a-zA-Z0-9_+&*-]+)*@(?:[a-zA-Z0-9-]+\\.)+[a-zA-Z]{2,7}$");

public class RegexExample {
    public static boolean isValidEmail(String email) {
        // 使用预编译的 Pattern 对象进行匹配
        Matcher matcher = EMAIL_PATTERN.matcher(email);
        return matcher.matches();
    }

    public static void main(String[] args) {
        String testEmail = "example@example.com";
        System.out.println("邮箱是否有效: " + isValidEmail(testEmail));
    }
}
```

**反例：**

```java
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class BadRegexExample {
    public static boolean isValidEmail(String email) {
        // 在方法体内每次调用都编译正则表达式
        Pattern pattern = Pattern.compile("^[a-zA-Z0-9_+&*-]+(?:\\.[a-zA-Z0-9_+&*-]+)*@(?:[a-zA-Z0-9-]+\\.)+[a-zA-Z]{2,7}$");
        Matcher matcher = pattern.matcher(email);
        return matcher.matches();
    }

    public static void main(String[] args) {
        String testEmail = "example@example.com";
        System.out.println("邮箱是否有效: " + isValidEmail(testEmail));
    }
}
```

> 检查工具：无

### 【J000125】强制：避免用一个对象访问一个类的静态变量和方法

这会无谓增加编译器解析成本，直接用**类名**来访问即可。

> 检查工具：
>
> 1. IDEA：Static member 'xxx.xxx' accessed via instance reference

### 【J000126】强制：尽量减少不必要的synchronized

**说明**：`synchronized` 关键字用于实现线程同步，确保在同一时刻只有一个线程能够访问被同步的代码块或方法。然而，使用 `synchronized` 会带来一定的性能开销，因为它会导致线程在获取锁和释放锁的过程中产生额外的操作，并且在锁竞争激烈的情况下，会增加线程的等待时间，降低程序的并发性能。

如果在代码中使用了不必要的 `synchronized`，或者 `synchronized` 块中包含了过多的操作，就会使这种性能开销更加明显。此外，如果同步的对象过大，也会导致更多的线程被阻塞，进一步影响程序的并发执行效率。

因此，为了提高程序的性能和并发能力，应尽量减少不必要的 `synchronized` 使用。如果确实有必要使用 `synchronized`，则应确保被 `synchronized` 包含的操作尽可能少，只将关键的、需要同步的代码放在同步块中，并且选择合适的、尽可能小的同步对象，以减少锁竞争的范围。

> 检查工具：无

### 【J001127】推荐：避免高并发场景下或在循环中直接调用 System.getProperty

**说明**：`System.getProperty` 底层基于 `Hashtable` 实现，所有读取操作均受全局同步锁保护，在高并发或循环中调用会产生严重的锁竞争。

1. **JVM 内置属性**：如 `line.separator`、`path.separator` 等，在 JVM 运行期间不会改变，应优先使用 JDK 提供的封装方法（如 `System.lineSeparator()`）或将其定义为静态常量。
2. **业务自定义属性**：若在程序运行期间逻辑上保持不变，应在类加载时通过 `static final` 变量进行缓存，避免在热点代码路径中重复获取。

**正例**：

```java
// 正例 1：使用 JDK 内置优化方法获取换行符
String lineSep = System.lineSeparator();

// 正例 2：将自定义配置缓存到静态常量中
public final class AppConfig {
    public static final String APP_REGION_SH = "shanghai";
    public static final String APP_REGION = System.getProperty("app.region", APP_REGION_SH);
}

// 在业务循环中使用常量
for (Item item : list) {
    if (AppConfig.APP_REGION.equals(item.getRegion())) {
        log.info("Processing item: {}", item.getId());
    }
}

```

**反例**：

```java
// 反例：在循环中频繁调用，导致重复的哈希查找和同步锁开销
for (Item item : list) {
    if (System.getProperty("app.region").equals(item.getRegion())) {
        log.info("Processing item: {}", item.getId());
    }
}

```

> 检查工具：无

## 系统I/O

### 【J000127】强制：利用缓冲流类提高I/O操作效率

**说明：** I/O 操作是常见的操作，涉及到从文件、网络等数据源读取数据，或者将数据写入到相应的目标中。然而，直接进行数据的读取和写入（即默认的数据 I/O 方式）会导致系统性能下降。这是因为直接 I/O 操作每次与外部设备（如磁盘、网络）进行交互时，都会产生一定的开销，例如系统调用、磁盘寻道等。频繁的这种交互会使系统资源消耗较大，从而降低整体性能。

为了解决这个问题，可以使用 Java 提供的系统数据缓冲流类，如 `BufferedInputStream`、`BufferedOutputStream`、`BufferedReader` 和 `BufferedWriter` 等。这些缓冲流类在内部维护了一个缓冲区，当进行 I/O 操作时，数据会先被读取到缓冲区中，或者从缓冲区写入到外部设备。这样，减少了与外部设备的直接交互次数，从而提高了 I/O 操作的效率。

更进一步，如果能够根据具体的应用场景，自定制合理大小的缓冲区进行数据的读取和写入，将会更大程度地提升系统性能。通过合理设置缓冲区大小，可以更好地平衡内存使用和 I/O 操作次数，达到最优的性能表现。

**正例：**

```java
public class BufferedIOExample {
    public static void main(String[] args) {
        String sourceFile = "source.txt";
        String targetFile = "target.txt";

        try (
                // 使用缓冲输入流读取文件
                BufferedInputStream bis = new BufferedInputStream(new FileInputStream(sourceFile));
                // 使用缓冲输出流写入文件
                BufferedOutputStream bos = new BufferedOutputStream(new FileOutputStream(targetFile))
        ) {
            byte[] buffer = new byte[8192]; // 自定义缓冲区大小
            int bytesRead;
            while ((bytesRead = bis.read(buffer)) != -1) {
                bos.write(buffer, 0, bytesRead);
            }
            System.out.println("文件复制成功");
        } catch (IOException e) {
            // dosth
        }
    }
}
```

**反例：**

```java
public class DirectIOExample {
    public static void main(String[] args) {
        String sourceFile = "source.txt";
        String targetFile = "target.txt";

        try (
                // 直接使用文件输入流读取文件
                FileInputStream fis = new FileInputStream(sourceFile);
                // 直接使用文件输出流写入文件
                FileOutputStream fos = new FileOutputStream(targetFile)
        ) {
            int byteRead;
            while ((byteRead = fis.read()) != -1) {
                fos.write(byteRead);
            }
            System.out.println("文件复制成功");
        } catch (IOException e) {
            // dosth
        }
    }
}
```

在反例中，每次调用 `read()` 方法都会直接从文件中读取一个字节，每次调用 `write()` 方法都会直接将一个字节写入到文件中，这会导致频繁的磁盘 I/O 操作，性能较低。而在正例中，使用了缓冲流和自定义的缓冲区，数据会先被批量读取到缓冲区中，然后再一次性写入到目标文件，减少了磁盘 I/O 操作的次数，从而提高了性能。

> 检查工具：无

# 应用配置

## 核心架构与模式

### 【J000128】推荐：遵循“三段式叠加模型”的配置分层

**说明**：应用配置不应是单一文件，应根据**变动频率**和**操作主体**分为三层，遵循**“高优先级覆盖低优先级”**的合并原则：
1. **基础层 (Base)**：研发提供，定义全量默认值（随代码打包）。
2. **适配层 (Patch)**：交付提供，定义环境调优与策略差异（外部挂载）。
3. **实例层 (Instance)**：现场提供，定义敏感信息与实例唯一标识（动态注入）。

> 检查工具：无

### 【J000129】推荐：外部配置遵循增量原则

**说明**：**严禁**全量拷贝内部配置文件到外部。外部配置（Properties/YAML）仅允许包含“不得不改”的配置项（如：JVM 调优参数、特定的业务开关）。
升级版本时，只需关注外部那几行配置是否受影响，实现“轻量化升级”。

> 检查工具：无

### 【J000130】强制：敏感信息隔离

**说明**：**严禁**在任何配置文件（YAML/Properties）中明文写入数据库密码、API Key、数字证书路径等。此类敏感配置必须通过**环境变量**注入。
研发在内部 YAML 中应使用占位符以起到提醒作用。

**正例**：

```yaml
spring:
  datasource:
    password: ${DB_PASSWORD:default}
```

> 检查工具：无

### 【J000131】推荐：遵循 Spring Boot 配置优先级与命名规范

**说明**：Spring Boot 启动时将严格遵循以下优先级（由高到低）：
1. **命令行参数** (`--server.port=...`)
2. **环境变量** (最高优先级环境变量覆盖文件)
3. **外部配置文件** (JAR 外的 Properties 或 YAML)
4. **内部配置文件** (JAR 内的 YAML)

* **配置文件命名**：统一命名为 `application.yml` 或 `application.properties`。
* **环境变量命名**：遵循“大写+下划线”原则（例如：`spring.datasource.url` 对应 `SPRING_DATASOURCE_URL`）。

> 检查工具：无

### 【J000132】推荐：根据部署场景选择合适的外部配置载体

**说明**：根据部署环境及工具链的不同，推荐使用以下两种标准模式：

**模式 A：公司ZCM平台部署（自动化工具链）**
* **适用场景**：使用公司ZCM云平台、一键升级/发布工具的项目。
* **配置组合**：`内部 YAML` + `外部 Properties` + `环境变量`
* **研发侧 (Internal YAML)**：使用 YAML 编写全量配置，利用其层级感描述复杂的业务逻辑和默认框架参数，打包在 JAR 内。
* **交付侧 (External Properties)**：使用 `.properties` 编写增量补丁。因为平台升级工具在进行“配置自动合并”与“版本 Diff”时，Properties 的“键值对单行化”特性比 YAML 的“缩进层级”更健壮，不易产生合并冲突。
* **现场侧 (Env)**：通过ZCM平台界面配置环境变量。

**模式 B：标准/非平台部署（手动或开源工具）**
* **适用场景**：客户环境、非公司云平台、无自研工具辅助的纯手动部署。
* **配置组合**：`内部 YAML` + `外部 YAML` + `环境变量`
* **研发侧 (Internal YAML)**：同上，作为系统运行的底座。
* **交付/现场侧 (External YAML)**：在 JAR 包同级目录下维护一个增量的 `application.yml`。在没有自动化工具辅助时，保持内外格式统一可以降低现场人员的学习成本和格式转换带来的低级错误。
* **现场侧 (Env)**：通过操作系统 `export` 或 Docker `env` 参数注入实例相关配置。

> 检查工具：无
