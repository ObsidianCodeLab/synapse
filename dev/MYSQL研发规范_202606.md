# 概述

## 编写目的

- 统一SQL语句编写格式。

- 让SQL语句更美观，更易阅读。

- 增强SQL可维护性。

- 避免低效SQL导致的性能问题。

## 适用范围

- 适用于MySQL 5.7及以上版本。

- 在使用C/C++、Java等各种编程语言进行开发活动及运维活动中编写SQL语句时，需要遵循此规范。

## 角色和职责

- 开发人员：负责按照SQL规范进行SQL编码。

- 运维人员：负责根据SQL规范编写运维需要的SQL脚本。

# SQL开发规范

## SQL书写规范

### 【推荐】数据库名，表名，字段名全部小写。

*例外：对于从ORACLE转MySQL的项目，数据库名，表名，字段名可继续保持ORACLE的SQL规范要求，用大写。*

**检查方式**：人工检查

### 【推荐】脚本SQL语句必须以分号结尾；程序内部和配置文件中SQL语句不强制使用分号结尾。

**检查方式**：人工检查

### 【推荐】SQL格式建议参照Workbench工具格式化，美观统一方便阅读。

*例外：对于从ORACLE转MySQL的项目，可按照ORACLE的SQL来格式化。*

**正例**

```sql
SELECT
	cust_id,
	cust_code 
FROM
	cust 
WHERE
	cust_name LIKE 'Ja%';
```

**检查方式**：人工检查

## 索引规约

### 【强制】超过三个实例表禁止 JOIN；需要 JOIN的字段，数据类型必须绝对一致；多表关联查询时，保证被关联的字段需要有索引。

**说明：**

即使双表JOIN也要注意表索引、SQL性能。

**<font color=red>反例</font>**

```sql
SELECT
	a.acct_id,
	a.acc_nbr,
	b.acct_item_type_id,
	b.comments 
FROM
	bc_transaction AS a
	JOIN bc_acct_book AS b ON a.txn_id = b.txn_id 
	AND a.acct_id = 13;
```

*Note: bc_transaction的txn_id是varchar(15)， bc_acct_book的txn_id是decimal(15,0)*

**正例**

```sql
SELECT
	a.pay_channel_id,
	a.pay_channel_name,
	b.attr_id,
	b.attr_value 
FROM
	pay_channel AS a
	JOIN pay_channel_attr AS b ON a.pay_channel_id = b.pay_channel_id;
```

*Note: pay_channel的pay_channel_id是decimal(15,0)，pay_channel_attr的pay_channel_id 是decimal(15,0)*

**检查方式**：人工检查

### 【强制】严禁左模糊或者全模糊搜索。

**说明：**

在SQL中尽量不使用LIKE。即使使用也要禁止使用前缀是%的LIKE匹配，因为索引文件具有 B-Tree的最左前缀匹配特性，如果左边的值未确定，那么无法使用此索引。

**<font color=red>反例</font>**

```sql
SELECT
	cust_id,
	cust_code 
FROM
	cust 
WHERE
	cust_name LIKE '%Ja%';
```

**正例**

```sql
SELECT 
  cust_id, 
  cust_code 
FROM 
  cust 
WHERE 
  cust_name LIKE ‘Ja%’;
```

**检查方式**：工具检查

### 【推荐】如果有 ORDER BY的场景，请注意利用索引的有序性。ORDER BY最后的字段是组合索引的一部分，并且放在索引组合顺序的最后，避免出现file_sort（文件排序）的情况，影响查询性能。

**<font color=red>反例</font>**
索引中有范围查找，那么索引的有序性无法利用。 如：

```sql
WHERE
	a > 10 
ORDER BY
	b;
```

索引a_b无法排序。

**正例**

```sql
WHERE
	a = ? 
	AND b = ? 
ORDER BY
	c;
```

索引：a_b_c

**检查方式**：人工检查

### 【推荐】利用覆盖索引来进行查询操作，避免回表。

**说明：**

如果一本书需要知道第 11章是什么标题，会翻开第 11章对应的那一页吗？目录浏览一下就好，这个目录就是起到覆盖索引的作用。 能够建立索引的种类：主键索引、唯一索引、普通索引，而覆盖索引是查询的一种效果，使用 explain查看结果，extra列会出现：using index。

**<font color=red>反例</font>**

```sql
SELECT 
  user, 
  host 
FROM 
  db AS a 
WHERE 
  a.user = 'mysql.sys';
```

*Note：已知a.user上有单列索引，应用场景中只是为了获取user信息；host为非必须要获取的信息，该host信息查询时需要回表；*

**正例**

```sql
EXPLAIN SELECT USER 
FROM
	db AS a 
WHERE
	a.USER = 'mysql.sys';
```

![image](uploads/4064/2a49c64c-4a22-43ba-8e08-05c920b458c4/dev_mysql_2.2.4_1.png)

*Note：已知a.user上有单列索引，应用场景中只是为了获取user信息，此时可以走索引不需要回表；*

**检查方式**：人工方式explain查看

### 【推荐】利用 延迟关联 或者 子查询 优化超多分页场景。

**说明：**

MySQL并不是跳过 offset行，而是取 offset+N行，然后返回时 放弃前 offset行，返回N行，那当 offset特别大的时候，效率就非常的低下，要么控制返回的总页数，要么对超过特定阈值的页数进行 SQL改写。

Note：分页查询的内层SQL必须显式指定ORDER BY子句，具体参看规范2.2.8。

**<font color=red>反例</font>**

```sql
SELECT 
  id, 
  name 
FROM 
  user_info 
WHERE 
  dep_id = 1 
LIMIT 
  100000, 
  20
```

**正例**

```sql
SELECT a.id, a.name
  FROM user_info AS a,
       (SELECT id
          FROM user_info
         WHERE dep_id = 1
         ORDER BY id LIMIT 100000, 20) AS b
 WHERE a.id = b.id;
```

*Note：先快速定位需要获取的 id字段，然后再关联*

**检查方式**：人工检查

### 【推荐】SQL性能优化的目标：至少要达到 range 级别，要求是ref级别，如果可以是 const最好。

**说明：**

1）const 单表中最多只有一个匹配行（主键或者唯一索引），在优化阶段即可读取到数据。

2）ref 指的是使用普通的索引（normal index）。

3）range 对索引进行范围检索。

**<font color=red>反例</font>**

explain表的结果，type=index，索引物理文件全扫描，速度非常慢，这个 index级别比较 range还低。只比全表扫描性能好一些。

```sql
EXPLAIN SELECT
	event_id 
FROM
	zcm_nms.alarm_event a 
WHERE
	a.alarm_time >= now() - 10 
	AND a.alarm_time <= now();
```

![image](uploads/4064/def6b407-cd55-4bd0-8286-439c4082783e/dev_mysql_2.2.6_1.png)

**正例**

```sql
EXPLAIN SELECT 
	event_id 
FROM 
	zcm_nms.alarm_event a 
WHERE 
	a.event_id = 30;
```

![image](uploads/4064/9a46d225-969b-4462-b352-72ee0ca9d15c/dev_mysql_2.2.6_2.png)

**检查方式**：人工检查

### 【强制】SQL语句禁止使用非同类型的列进行等值查询

**说明：**

字段类型不同会造成隐式转换，导致索引失效。

**<font color=red>反例</font>**

```sql
SELECT 
  name 
FROM 
  test 
WHERE 
  name = 1; 
```

*Note：其中name为字符类型字段，1为int数字类型，索引失效；*

*下面这个例子是个特殊情况，了解即可，不推荐使用。*

```sql
SELECT 
  id 
FROM 
  test 
WHERE 
  id = ’1’; 
```

*Note：其中id列为int数字类型，数字类型转字符类型，虽然索引不失效，但不建议这么使用。*

**正例**

```sql
SELECT 
  name 
FROM 
  test 
WHERE 
  name = ‘whalecloud’; 
```

*Note：其中name为字符类型字段，类型一致*

**检查方式**：人工检查

### 【强制】在进行 延迟关联 或 子查询 进行分页查询时，内层SQL必须显式指定ORDER BY子句

**说明：**

在使用 延迟关联 或 子查询 进行分页查询时，必须在内层SQL中加上ORDER BY子句。这样可以确保分页结果的顺序稳定和可预期，避免因数据的物理存储顺序变化或执行计划调整导致分页结果发生漂移、重复或遗漏。如果未指定ORDER BY，MySQL不会保证返回结果的顺序，可能会导致前后分页数据重叠或丢失。因此，强制要求在分页相关的子查询或延迟关联的内层查询中使用ORDER BY，通常应以主键或唯一索引字段作为排序依据，以保证数据一致性和查询的正确性。

**<font color=red>反例</font>**

```sql
SELECT a.id, a.name
  FROM user_info AS a,
       (SELECT id
          FROM user_info
         WHERE dep_id = 1
         LIMIT 100000, 20) AS b
 WHERE a.id = b.id;
```

*Note：内层SQL中无ORDER BY子句*

**正例**

```sql
SELECT a.id, a.name
  FROM user_info AS a,
       (SELECT id
          FROM user_info
         WHERE dep_id = 1
         ORDER BY id LIMIT 100000, 20) AS b
 WHERE a.id = b.id;
```

*Note：以主键 id作为排序依据，先快速定位需要获取的 id字段，然后再关联*

**检查方式**：人工检查

**案例说明**：  
**案例1** - 故障单3234455（本单为Oracle故障，但MySQL也需要关注和规避）
**故障描述**：  
某项目升级后，各Channel无法订购U25&U35。  
**原因分析**：  
分页查询功能实现时存在问题，出现重复数据，导致计费入库时主键冲突；同时同步给计费缓存的部分属性丢失，导致offer无法订购。  
**解决方案**：  
排查整改分页查询语句，查询必须加上唯一性的排序标识。例如，有些业务查询要求根据时间进行排序，时间排序后的结果仍然不具有非唯一性，在主要的业务排序后加上必要的主键排序。

**案例2** - 事务单3319188（本单为Oracle故障，但MySQL也需要关注和规避）
**故障描述**：  
某项目，38万订户没有收到租费赠送。  
**原因分析**：  
分页查询全量数据时没有做排序，后续全量同步给计费缓存时，因为存在重复数据，导致OFFER_ATTR数据同步不完整。  
**解决方案**：  
分页查询时增加字段OFFER_ID和ATTR_ID作为排序字段。

## SQL规约

### 【推荐】使用COUNT(*)来统计记录行数

**说明：**

不要使用 COUNT(列名) 或 COUNT(常量) 来替代 COUNT(\*)，COUNT(\*) 是 SQL92定义的标准统计行数的语法，跟数据库无关，跟 NULL和 非NULL无关。COUNT(DISTINCT col) 计算该列除 NULL之外的不重复行数。

COUNT(*) 会统计值为 NULL的行，而 COUNT(列名)不会统计此列为 NULL值的行。

*Note：*

- *COUNT(DISTINCT col1, col2) 如果其中一列全为*
  *NULL，那么即使另一列有不同的值，也返回为 0;*

- *COUNT(\*) 和 COUNT(常量) 的性能并没有明显的差异; MySql官网：InnoDB handles*
  *SELECT COUNT(\*) and SELECT COUNT(1) operations in the same way. There is no*
  *performance difference. 适用于MySQL5.7+版本。*

**<font color=red>反例</font>**

```sql
mysql> select runoob_id,runoob_title from runoob_tbl; 
+-----------+--------------+ 
|runoob_id  |runoob_title  | 
+-----------+--------------+ 
|         1 | kaka         | 
|         2 | NULL         | 
|         3 | NULL         |
+-----------+--------------+ 
3 rows in set (0.00 sec) 

mysql> select count(runoob_title) from runoobtbl; 
+---------------------+
|count(runoob_title)  | 
+---------------------+
|                   1 |
+---------------------+ 
1 row in set (0.00 sec) 
```

*Note：COUNT(列名)返回的是该列的值不为NULL的行数*

**正例**

```sql
mysql> select runoob_id,runoob_title from runoob_tbl; 
+-----------+--------------+
| runoob_id | runoob_title | 
+-----------+--------------+
|        1  | kaka         | 
|        2  | NULL         | 
|        3  | NULL         |
+-----------+--------------+ 
3 rows in set (0.00 sec) 

mysql> select count(*) from runoob_tbl; 
+----------+ 
| count(*) | 
+----------+ 
|       3  |
+----------+ 
1 row in set (0.01 sec) 
```

*Note：COUNT(\*)为标准统计行数的方法，与NULL和非NULL值无关。*

**检查方式**：人工检查

### 【强制】 当某一列的值全是NULL时，COUNT(col)的返回结果为 0，但SUM(col)的返回结果为NULL，因此使用 SUM()时需注意NPE（空指针）问题。

**<font color=red>反例</font>**

```sql
mysql> select runoob_id,runoob_title from runoob_tbl; 
+-----------+--------------+
| runoob_id | runoob_title |
+-----------+--------------+
|         2 |    NULL      |
|         3 |    NULL      |
+-----------+--------------+ 
2 rows in set (0.00 sec) 

mysql> select sum(runoob_title) from runoob_tbl;
+-------------------+
| sum(runoob_title) | 
+-------------------+
| NULL              |
+-------------------+ 
1 row in set (0.00 sec)
```

**正例**

例1：

```sql
mysql> select runoob_id,runoob_title from runoob_tbl; 
+-----------+--------------+
| runoob_id | runoob_title | 
+-----------+--------------+
|        2  |    NULL      | 
|        3  |    NULL      | 
+-----------+--------------+ 
2 rows in set (0.00 sec) 

mysql> select count(runoob_title) from runoob_tbl; 
+---------------------+ 
|count(runoob_title)  | 
+---------------------+ 
|                  0  | 
+---------------------+ 
1 row in set (0.00 sec) 
```

例2：

可以使用如下方式来避免 SUM()的 NPE问题：

```sql
SELECT
	IFNULL( SUM( g ), 0 ) 
FROM
	TABLE;
```

**检查方式**：工具检查

### 【强制】使用 ISNULL()来判断是否为 NULL值。

**说明：**

NULL与任何值的直接比较都为 NULL。

1） NULL<>NULL的返回结果是 NULL，而不是 false。

2） NULL=NULL的返回结果是 NULL，而不是 true。

3） NULL<>1的返回结果是 NULL，而不是 true。

**<font color=red>反例</font>**

```sql
mysql> select runoob_id from runoob_tbl where runoob_title = null;
Empty set (0.00 sec) 

mysql> select runoob_id from runoob_tbl where runoob_title <> null;
Empty set (0.01 sec)
```

**正例**

返回1：

```sql
mysql> select isnull(null); 
+--------------+ 
| isnull(null) | 
+--------------+ 
|          1   | 
+--------------+ 
1 row in set (0.00 sec) 
```

返回0：

```sql
mysql> select isnull(1+1); 
+-------------+
| isnull(1+1) | 
+-------------+ 
|         0   | 
+-------------+ 
1 row in set (0.00 sec) 
```

*Note： ISNULL(expr) 的用法： 如expr 为null，那么ISNULL() 的返回值为 1，否则返回值为 0。*

**检查方式**：工具检查

### 【强制】禁止使用：触发器、自定义函数、存储过程、视图、事件等MySQL高级功能

**说明：**

存储过程难以调试和扩展，更没有移植性。 为避免业务逻辑与数据存储发生耦合，禁止使用上述功能，否则不利于后期scale out（扩展）、sharding（分库分表）。

*Note：MySQL数据库原生函数可以用，自定义函数不可用。*

**检查方式**：人工检查

### 【推荐】SQL语句中表的别名前加AS。

**说明：**

1）别名可以是表的简称。

2）别名前加 AS 使别名更容易识别。

**<font color=red>反例</font>**

```sql
SELECT 
  tf.name 
FROM 
  table_first tf, 
  table_second ts 
WHERE 
  tf.id = ts.id;
```

**正例**

```sql
SELECT 
  tf.name 
FROM 
  table_first AS tf, 
  table_second AS ts 
WHERE 
  tf.id = ts.id;
```

**检查方式**：人工检查

### 【推荐】IN操作能避免则避免，若实在避免不了，需要仔细评估IN后边的集合元素数量，控制在 500个之内。

**说明：**

可以用EXISTS代替IN，EXISTS在某些场景比IN效率高。

**正例**

例1：

此场景适应A表数据量大于B表（B表数据量较少），且WHERE后的字段加了索引。这种情况用IN效率高的原因是利用了大表的索引。

```sql
SELECT
	a.ecs_goods_id,
	a.ecs_goods_name 
FROM
	ecs_goods AS a 
WHERE
	a.cat_id IN ( SELECT b.cat_id FROM ecs_category AS b );
```

例2：

此场景适应B表数据量大于A表，且WHERE后的字段加了索引。这种情况用EXISTS效率高的原因是利用了大表的索引。

```sql
SELECT
	a.ecs_goods_id,
	a.ecs_goods_name 
FROM
	ecs_goods AS a 
WHERE
	EXISTS ( SELECT cat_id FROM ecs_category AS b WHERE a.cat_id = b.cat_id );
```

**检查方式**：人工检查

### 【强制】禁止在开发代码中使用TRUNCATE TABLE语句

**说明：**

TRUNCATE TABLE可能会造成生产的性能事故和安全事故。

**检查方式**：工具检查

### 【强制】DELETE FROM, UPDATE语句，必须带WHERE条件

**说明：**

如若不加WHERE条件，则是对全表进行删除、更新操作，可能会引起非常严重的后果，所以必须要加上相应的WHERE条件方可。

**<font color=red>反例</font>**

```sql
mysql> select * from runoob_tbl; 
+-----------+--------------+
|runoob_id  | runoob_title | 
+-----------+--------------+ 
|       2   |      NULL    | 
|       3   |      NULL    |
|  27013087 |      master  |
+-----------+--------------+ 
3 rows in set (0.00 sec) 

mysql> delete from runoob_tbl;
Query OK, 3 rows affected (0.01 sec) 

mysql> select * from runoob_tbl;
Empty set (0.00 sec)
```

*Note：如果不带WHERE条件的DELETE操作，会将表中所有记录都删除。如果表中数据量过大，也可能会造成性能事故。*

**检查方式**：工具检查

### 【强制】禁止使用跨库查询，包括同一实例也禁止使用跨库查询。

**说明：**

禁止使用跨库（跨schema）查询，方便后续分库分表。

**正例**

```sql
SELECT 
  a.prefix, 
  a.acc_nbr, 
  b.acct_name 
FROM 
  subs AS a, 
  acct AS b 
WHERE 
  a.acct_id = b.acct_id 
  AND b.acct_id = 3421; 
```

*Note：subs表在ocs库，acct表在ocs库，当前是ocs库。*

**<font color=red>反例</font>**

```sql
SELECT 
  a.prefix, 
  a.acc_nbr, 
  b.order_item_id 
FROM 
  subs AS a, 
  crm.order AS b 
WHERE 
  a.cust_id = b.cust_id; 
```

*Note：subs表在ocs库，order表在crm库，当前是ocs库。*

**检查方式：人工检查

### 【推荐】核心业务流程SQL包含：数学运算（数据库不擅长数学运算和逻辑判断）、多表关联、表遍历CASE WHEN等复杂查询，建议拆分成单表简单查询

**说明：**

*提示：本条目与ORACLE开发规范有差异*

**<font color=red>反例</font>**

```sql
SELECT
	SUM( a.amount ) 
FROM
	payment AS a,
	acct_book AS b 
WHERE
	a.payment_id = b.acct_book_id 
	AND b.acct_id = ?;
```

*Note：payment和acct_book都是大表，不建议关联查询*

**正例**

```sql
SELECT 
  b.acct_book_id 
FROM 
  acct_book AS b 
WHERE 
  b.acct_id = ?; 
  
SELECT 
  SUM(a.amount) 
FROM 
  payment AS a 
WHERE 
  a.payment_id IN (?); 
```

*Note：payment和acct_book都是大表，拆成单表简单查询*

**检查方式**：人工检查

### 【推荐】事务要简单，整个事务的时间长度不要太长，要及时提交。

**检查方式**：人工检查

### 【强制】对数据库的批量增删改操作，应拆分成多个事务进行操作。限制单个事务所操作的数据集大小，不能超过10000 条记录。

**检查方式**：工具检查（UDAL和Sharding-jdbc已有审计功能）

### 【强制】条件中对于同一个字段使用到OR的SQL语句必须改写成用IN()。

**说明：**

MySQL 中OR的效率比IN低很多

**<font color=red>反例</font>**

```sql

WHERE
	id = 1 
	OR id = 2 
	OR id = 3;
```

**正例**

```sql

WHERE
	id IN ( 1, 2, 3 );
```

**检查方式**：工具检查

### 【推荐】当只有一行数据时使用LIMIT 1。

**说明：**

大数据量，过滤条件未加索引，且事先知道结果只需要一条记录时使用LIMIT 1，可加快执行效率。

**<font color=red>反例</font>**

```sql
SELECT 
  cust_name 
FROM 
  cust 
WHERE 
  email = ? 
```

*Note：email字段上无索引，即使找到一条记录也会继续往后找，性能低。*

**正例**

```sql
SELECT
	cust_name 
FROM
	cust 
WHERE
	email = ? 
	LIMIT 1
```

*Note：email字段上无索引，找到一条记录后即返回*

**检查方式**：人工检查

### 【推荐】避免使用大表做JOIN、GROUP BY分组、排序。

**<font color=red>反例</font>**

```sql
SELECT
	txn_type_id,
	SUM( amount ) 
FROM
	bc_transaction 
WHERE
	acct_id = ? 
GROUP BY
	txn_type_id;
```

**正例**

```sql
SELECT 
  txn_type_id, 
  amount 
FROM 
  bc_transaction 
WHERE 
  acct_id = ?; 
```

*Note：代码里面根据txn_type_id对金额进行汇总。*

**检查方式**：人工检查

### 【建议】尽量不使用NOT IN。

**说明：**

数据库不善于反向查找，故不建议使用NOT IN。

**<font color=red>反例</font>**

```sql
SELECT
	t.id,
	t.type_name,
	t.parent_id,
	t.style,
	t.levels 
FROM
	type_code AS t 
WHERE
	t.parent_id = '30119a0e-2f57-473d-9f1d-2843561e9064' 
	AND t.id NOT IN ( SELECT a.parent_id FROM type_code AS a WHERE a.parent_id IS NOT NULL );
```

### 【建议】合理选择UNION ALL与UNION。

**说明：**

UNION在进行表链接后会筛选掉重复的记录，所以在表链接后会对所产生的结果集进行排序运算，删除重复的记录再返回结果，如果表数据量大的话可能会导致用磁盘进行排序。 UNION ALL操作只是简单的将两个结果合并后就返回，所以可能存在重复记录。 需要结合业务需求分析使用UNION ALL的可行性。

**正例**

```sql
mysql> SELECT id,name,age FROM std1 WHERE 1=1; 
+----+-------+-----+ 
| id | name  | age | 
+----+-------+-----+ 
| 11 | May   | 18  | 
| 12 | Jane  | 15  | 
| 13 | Sunny | 19  | 
+----+-------+-----+ 
3 rows in set 

mysql> SELECT id,name,age FROM std2 WHERE 1=1; 
+----+------+-----+ 
| id | name | age | 
+----+------+-----+ 
| 11 | May  | 18  | 
| 18 | Anni | 16  | 
+----+------+-----+ 
2 rows in set 

mysql> SELECT id,name,age FROM std1 UNION SELECT id,name,age FROM std2; 
+----+-------+-----+ 
| id | name  | age | 
+----+-------+-----+ 
| 11 | May   | 18  | 
| 12 | Jane  | 15  | 
| 13 | Sunny | 19  | 
| 18 | Anni  | 16  | 
+----+-------+-----+ 
4 rows in set 

mysql> SELECT id,name,age FROM std1 UNION ALL SELECT id,name,age FROM std2; 
+----+-------+-----+ 
| id | name  | age | 
+----+-------+-----+ 
| 11 | May   | 18  | 
| 12 | Jane  | 15  | 
| 13 | Sunny | 19  | 
| 11 | May   | 18  | 
| 18 | Anni  | 16  | 
+----+-------+-----+ 
5 rows in set 
```

*Note：上述举例说明UNION ALL和UNION对于查询结果的区别，请结合实际场景合理选择。*

**检查方式**：工具检查

### 【强制】禁止在OLTP类型系统中使用没有WHERE条件的查询。

**<font color=red>反例</font>**

```sql
SELECT 
  acc_nbr, 
  acct_id 
FROM 
  subs;
```

**正例**

```sql
SELECT 
  acc_nbr 
FROM 
  subs 
WHERE 
  subs_id = 120098;
```

**检查方式**：工具检查

### 【强制】使用SELECT、INSERT语法时必须写上具体的字段名，避免在表结构变更后出现不必要的麻烦。

**说明：**

*Note：*

*a．当需要查询表中的所有列时，也需列出所有的字段名。*

*b．例外：如果有子查询，而且子查询有列名的，可以使用SELECT \*。目前框架的分页是对业务侧SQL进行了一层包装，必须要select \* ,因为框架不知道业务SQL细节。 这个规则在框架侧可以例外。*

**<font color=red>反例</font>**

例1：

```sql
SELECT 
  * 
FROM 
  std1; 
```

例2：

```sql
INSERT INTO std2
VALUES
	( 11, 'May', 18 );
```

**正例**

例1：

```sql
SELECT 
  id, 
  name, 
  age 
FROM 
  std1;
```

例2：

```sql
INSERT INTO std2 (id, name, age) 
VALUES 
  ( 11, 'May', 18 );
```

**检查方式**：工具检查

### 【强制】禁止在代码中拼接sql，推荐使用预编译sql。

**说明：**

Java代码中使用 prepared statement 对象，只传参数，比传递 SQL 语句更高效；一次解析，多次使用；降低SQL 注入概率。

**<font color=red>反例</font>**

```java
String sql = "SELECT id,name FROM tb_name WHERE name= '"+varname+"' AND passwd='"+varpasswd+"'"; 
```

（1）如果我们把[' or '1' = '1]作为varpasswd传入进来，用户名随意

```sql
SELECT 
  id,
  name 
FROM 
  tb_name 
WHERE 
  name= '随意' 
  AND passwd = '' 
  or '1' = '1';
```

因为'1'='1'肯定成立,所以可以任何通过验证。

（2）如果把[';drop table tb_name;]作为varpasswd传入进来，则:

```sql
SELECT 
  * 
FROM 
  tb_name 
WHERE 
  name= '随意' 
  AND passwd = '';

drop table tb_name; 
```

MySQL数据库可以使这些语句得到执行。

**正例**

```sql
perstmt = con.prepareStatement ( "insert into tb_name (col1,col2,col2,col4) values (?,?,?,?)" );
perstmt.setString ( 1, var1 );
perstmt.setString ( 2, var2 );
perstmt.setString ( 3, var3 );
perstmt.setString ( 4, var4 );
perstmt.executeUpdate ();
```

**检查方式**：工具检查

### 【强制】禁止使用 ORDER BY RAND()。

**说明：**

ORDER BY RAND() 生成随机结果，会降低查询效率.

**<font color=red>反例</font>**

```sql
SELECT 
  id, 
  name, 
  work_date 
FROM 
  employee_tbl 
ORDER BY 
  RAND();
```

**检查方式**：工具检查

### 【强制】禁止单条 SQL 语句同时更新多个表。

**<font color=red>反例</font>**

```sql
UPDATE subs AS s 
LEFT JOIN acct AS a ON s.acct_id = a.acct_id 
SET s.prefix = ‘0086’ 
SET e.salary = 10000, 
  t.name= ‘ABC’ 
WHERE 
  e.id = 3 
  AND t.id = 1;
```

**正例**

```sql
UPDATE subs AS a 
SET a.prefix = ‘ 0086’ 
WHERE
	a.acct_id = ?;
```

**检查方式**：人工检查

### 【强制】禁止使用SELECT … FOR UPDATE / LOCK IN SHARE MODE的操作，会导致锁表。

**说明：**

select ... for update 语句，相当于一个 update 语句。在业务繁忙的情况下，如果事务没有及时的commit或者rollback 可能会造成其他事务长时间的等待，从而影响数据库的并发使用效率。
select ...  lock in share mode 语句是一个给查找的数据上一个共享锁（S 锁）的功能，它允许其他的事务也对该数据上 S锁，但是不能够允许对该数据进行修改。如果不及时的commit 或者rollback 也可能会造成大量的事务等待。
for update 和 lock in share mode 的区别：前一个上的是排他锁（X 锁），一旦一个事务获取了这个锁，其他的事务是没法在这些数据上执行 for update ；后一个是共享锁，多个事务可以同时的对相同数据执行 lock in share mode。

**<font color=red>反例</font>**

```sql
SELECT
	acct_item_type,
	charge 
FROM
	acct_item AS a 
WHERE
	acct_id = ? 
	AND acct_item_type_id = 3 FOR UPDATE;
```

**检查方式**：工具检查

### 【建议】减少对函数的使用，方便MySQL与Oracle之间迁移，同时降低数据库CPU的消耗。

**<font color=red>反例</font>**

```sql
UPDATE subs AS s 
SET s.update_date = SYSDATE - 1 
WHERE
	s.subs_id = ?;
```

*NOTE: Oracle中SYSDATE – 1表示当前时间减1天；MySQL中SYSDATE() – 1表示当前时间减1秒。这种数据库间的差异已经导致过程序故障。*

**正例**

```sql
UPDATE subs AS s 
SET s.update_date = ? 
WHERE
	s.subs_id = ?;
```

*Note: SQL中需要传入实例化后的时间参数。*

**检查方式**：人工检查

### 【推荐】用WHERE子句替换HAVING子句。

**说明：**

避免使用HAVING子句，HAVING只会在检索出所有记录之后才对结果集进行过滤，这个处理需要排序、统计等操作。如果能通过WHERE子句限制记录的数目，那就能减少这方面的开销。

**<font color=red>反例</font>**

```sql
SELECT
	e.deptno,
	SUM( e.sal ) 
FROM
	emp AS e 
GROUP BY
	e.deptno 
HAVING
	e.deptno = 20;
```

**正例**

```sql
SELECT
	e.deptno,
	SUM( e.sal ) 
FROM
	emp AS e 
WHERE
	e.deptno = 20 
GROUP BY
	e.deptno;
```

**检查方式**：工具检查

### 【强制】HAVING条件中不要使用“AND”或“OR”连接的多个表达式；【违反后果】可能导致性能低。

**<font color=red>反例</font>**

```sql
SELECT 
  p.firstname, 
  p.lastname 
FROM 
  people AS p 
HAVING 
  p.firstname LIKE '%user_submitted_data%' 
  OR p.lastname LIKE '%user_submitted_data%' 
  OR p.fullname LIKE '%user_submitted_data%; 
```

**检查方式**：人工检查

### 【强制】HAVING条件中请在表达式左侧使用字段或别名，右侧使用过滤值；【违反后果】可能导致性能低。

**<font color=red>反例</font>**

```sql
SELECT 
  p.product_type, 
  COUNT(*) 
FROM 
  product AS p 
GROUP BY 
  p.product_type 
HAVING 
  2 = COUNT(*);
```

**正例**

```sql
SELECT 
  p.product_type, 
  COUNT(*) AS numbers
FROM 
  product AS p 
GROUP BY 
  p.product_type 
HAVING 
  numbers = 2;
```

**检查方式**：人工检查

### 【强制】HAVING条件中使用字段或函数的别名，勿使用函数本身；【违反后果】可能导致性能低。

<font color=red>**反例**</font>

```sql
SELECT
	s.cam_id c.cam_name,
	AVG( s.id ) AS studentAvg 
FROM
	Students AS s
	JOIN campus AS c ON c.cam_id = s.cam_id 
GROUP BY
	s.cam_id,
	c.cam_name 
HAVING
	AVG( s.id ) > 2200000 
ORDER BY
	s.cam_id;
```

**正例**

```sql
SELECT
	s.cam_id,
	c.cam_name,
	AVG( s.id ) AS studentAvg 
FROM
	Students AS s
	JOIN campus AS c ON c.cam_id = s.cam_id 
GROUP BY
	s.cam_id,
	c.cam_name 
HAVING
	studentAvg > 2200000 
ORDER BY
	s.cam_id;
```

**检查方式**：人工检查

### 【强制】主SQL语句的HAVING中不要使用子查询（Subquery），只能处理常量；【违反后果】可能导致性能低。

<font color=red>**反例**</font>

```sql
SELECT
	a.deptno,
	AVG( a.sal ) AS salAvg 
FROM
	emp AS a 
GROUP BY
	a.deptno 
HAVING
	salAvg > ( SELECT b.AVG( sal ) FROM emp AS b );
```

**正例**

```sql
SELECT
	a.deptno,
	AVG( a.sal ) AS salAvg 
FROM
	emp AS a 
GROUP BY
	a.deptno 
HAVING
	salAvg > 15000;
```

**检查方式**：人工检查

### 【强制】使用MySQL序列函数nextval()时，必须独立事务，并在获取序列后立即提交

**说明：**

使用MySQL序列函数nextval()时，必须独立事务，并在获取序列后立即提交。因为函数内部会有行锁，如果事务是跟随业务线程提交的，业务线程阻塞的情况下，会导致行锁一直得不到释放，并发性能就会有问题。

Note：原生MySQL未提供序列功能，MySQL序列函数nextval()是国际框架封装的能力。

**检查方式**：人工检查

**案例说明**：
**案例** - 故障单3792985
**故障描述**：
某项目升级版本，发现MED采集CDR入库处理速度变慢，入库数据出现积压，数据库出现连接超时，引发部分SQL无法正常执行（SQL执行频繁出现lock wait，查Sequence的语句要50秒才能执行完成）。
**原因分析**：
MySQL获取序列是通过业务调用框架封装的数据库函数nextval()来实现的，且获取序列的函数在业务处理中执行提交操作，预处理进程中错单量增加，导致频繁获取话单序列，引起锁等待。
**解决方案**：
将获取MySQL序列的SQL使用单独的数据库链接，并在获取序列后立即提交。

# 分布式数据库SQL开发规范

本章节涉及的条目为分布式数据库共性的内容，分布式数据库包括并不限于UDAL、DRDS、ZDaaS、ZDaaS-JDBC。由于SQL语法灵活复杂，分布式数据库和单机数据库的查询场景又不完全相同，难免有和单机数据库不兼容的SQL出现。下文中提及的不支持的条目，指分布式数据库本身功能不支持的 和 使用时可能存在性能等问题不允许使用的。

## 分布式数据库名词解释

| **名词** | **说明**                                                     |
| -------- | ------------------------------------------------------------ |
| 全局表   | 在业务系统中，往往存在大量的类似字典表的数据库表，这类表的数据量一般较小，变化不频繁，如：字典、配置、工号、基表、区域等，这类表定义为全局表，即在每个库都保存一份完整的相同数据，全局表就是用于解决这一类表的跨库关联查询问题。全局表也叫广播表。 |
| 分片表   | 分片（水平）是根据某种规则将数据分散至多个库中,每个分片仅包含数据的一部分。这类表即为分片表，这些库即为分片。 |
| 库内分表 | 逻辑表在同一个数据库实例的同一个schema内进行分表，以解决单表数据量过大、分片数量过多和跨分片事务的问题。例如将goods表分成多个子表，分别为goods_0, goods_1, goods_2……可用于替换MySQL的分区表。库内分表和水平分库组合使用。狭义的库内分表是不分片纯库内分表。 |
| 分片键   | 用于分片的字段，是将数据库（表）水平拆分的关键字段。例：将订单表中的订单主键的尾数取模分片，则订单主键为分片字段。 SQL 中如果无分片字段，将执行全路由，性能较差。 |
| 垂直分片 | 按照业务拆分的方式称为垂直分片，又称为纵向拆分，它的核心理念是专库专用。 在拆分之前，一个数据库由多个数据表构成，每个表对应着不同的业务。而拆分之后，则是按照业务将表进行归类，分布到不同的数据库中，从而将压力分散至不同的数据库。 |
| 水平分片 | 水平分片又称为横向拆分。 相对于垂直分片，它不再将数据根据业务逻辑分类，而是通过某个字段（或某几个字段），根据某种规则将数据分散至多个库或表中，每个分片仅包含数据的一部分。 |
| 逻辑表   | 水平拆分的数据库（表）的相同逻辑和数据结构表的总称。例：订单数据根据主键尾数拆分为 10 张表，分别是 `t_order_0` 到 `t_order_9`，他们的逻辑表名为 `t_order`。 |
| 真实表   | 在分片的数据库中真实存在的物理表。即上个示例中的 `t_order_0` 到 `t_order_9`。 |
| 绑定表   | 指分片规则一致的主表和子表。例如：`t_order` 表和 `t_order_item` 表，均按照 `order_id` 分片，则此两张表互为绑定表关系。绑定表之间的多表关联查询不会出现笛卡尔积关联，关联查询效率将大大提升。 |
| 动态表   | 动态表主要用于一些应用需要在运行时动态创建表，而表又是分片表的场景。这些表有相同的表名前缀，后缀通常是时间或数字，比如Billing会根据账期ID来每月建表，表名如EVENT_ACCT_ITEM_LIST_10344、EVENT_ACCT_ITEM_LIST_1029等。 |
| 读写分离 | 对于同一时刻有大量并发读操作和较少写操作类型的应用系统来说，将数据库拆分为主库和从库，主库负责处理事务性的增删改操作，从库负责处理查询操作，能够有效的避免由数据更新导致的行锁，使得整个系统的查询性能得到极大的改善。 |

## SQL兼容性约束

### 【强制】不支持 BEGIN…END、LOOP…END LOOP、REPEAT…UNTIL…END、REPEAT、WHILE…DO…END WHILE 等复合语句。

**<font color=red>反例</font>**

例1：

```sql
BEGIN 
  SELECT 
    user_name 
  FROM 
    user； 
END
```

例2：

```sql
BEGIN
		label1 :
	LOOP
			
			SET p1 = p1 + 1;
		IF
			p1 < 10 THEN
				ITERATE label1;
			
		END IF;
		LEAVE label1;
		
	END LOOP label1;
	
	SET @x = p1;

END
```

例3：

```sql
BEGIN
	DECLARE
		i INT;
	DECLARE
		sum INT;
	
	SET i = 1;
	
	SET sum = 0;
	REPEAT
			
			SET sum = sum + i;
		
		SET i = i + 1;
		UNTIL i > n 
	END REPEAT;
	SELECT
		sum;

END
```

例4：

```sql
BEGIN
	WHILE
			age < 10 DO
			
			SET age = age + 1;
		
	END WHILE;
	SELECT
		user_name 
	FROM
		USER;

END
```

**检查方式**：工具检查，中间件自动拦截

### 【强制】不支持类似 IF 、WHILE 等流程控制类语句。

**<font color=red>反例</font>**

例1：

```sql
BEGIN

		SET age = 15;
	IF
		age > 2 THEN
		SELECT
			user_name 
		FROM
			USER;
	
END IF;
```

例2：

```sql
BEGIN
	WHILE
			age < 10 DO
			
			SET age = age + 1;
		
	END WHILE;
	SELECT
		user_name 
	FROM
		USER;

END
```

**检查方式**：工具检查，中间件自动拦截

### 【强制】不支持 SAVEPOINT 操作；禁止使用在SQL里带SCHEMA操作。

**<font color=red>反例</font>**

例1：

```sql
SET autocommit = 0;
START TRANSACTION;
INSERT USER
VALUES
	( NULL, 'caster' );
SAVEPOINT x;
INSERT USER
VALUES
	( NULL, 'ruler' );
```

例2：

```sql
SELECT 
  user_name 
FROM 
  TABLE_SCHEMA.project
```

**检查方式**：工具检查

### 【强制】不支持CREATE TABLE tbl_name LIKE old_tbl_name；不支持CREATE TABLE tbl_name SELECT statement。

**检查方式**：工具检查，中间件自动拦截

### 【强制】不支持UPDATE分片键、分表键的值。

**<font color=red>反例</font>**

```sql
UPDATE subs 
SET cust_id = 2341,
routing_id = 3 
WHERE
	subs_id = 32100;
```

*Note：subs表的分片键routing_id，分表键cust_id*

**检查方式**：工具检查，中间件自动拦截

### 【强制】不支持 SELECT INTO OUTFILE/INTO DUMPFILE/INTO var_name。

**检查方式**：工具检查，中间件自动拦截

### 【强制】不支持 SQL 中带聚合条件的关联子查询（Correlate Subquery）。

**<font color=red>反例</font>**

```sql
SELECT
	product_type,
	product_name,
	sale_price 
FROM
	product AS p1 
WHERE
	sale_price > ( SELECT AVG( sale_price ) FROM product AS p2 WHERE p1.product_type = p2.product_type );
```

**检查方式**：人工检查，中间件自动拦截

### 【强制】不支持 SQL 中对于变量的引用和操作，比如 SET @c=1, @d=@c+1; SELECT @c, @d。

**<font color=red>反例</font>**

```sql
SET @var1 = 1; 
SET @var2 = 2; 
SELECT @sum:=(a + b) AS sum; 
```

**检查方式**：工具检查，中间件自动拦截

### 【强制】不支持SELECT语句包含ESCAPE定义特殊转义符。

**<font color=red>反例</font>**

```sql
SELECT 
  t.id, 
  t.code 
FROM 
  tb1 AS t 
WHERE 
  name LIKE '/_a%' ESCAPE '/'; 
```

**检查方式**：工具检查，中间件自动拦截

### 【强制】不支持SELECT语句空字符串为别名。

**<font color=red>反例</font>**

```sql
SELECT 
  id, 
  name, 
  LEN(name) AS '' 
FROM 
  student; 
```

**检查方式**：工具检查，中间件自动拦截

### 【强制】关联的分片表的分布必须一致。

**说明：**

关联的分片表的分布一致，比如保证分片规则，分片节点，分片键值（两个字段的名称可以不一样，但实际含义必须一样）一致。

**<font color=red>反例</font>**

```sql
SELECT 
  a.acc_nbr, 
  b.order_item_id 
FROM 
  subs AS a, 
  order_item AS b 
WHERE 
  a.cust_id = b.cust_id; 
```

*Note: subs表分片键为cust_id，order_item表的分片键为order_id。虽然关联字段的名字一样，但是一个是分表键，一个不是分表键。*

**正例**

```sql
SELECT 
  a.name, 
  b.ext_info 
FROM 
  a, 
  b 
WHERE 
  a.cust_id = b.ext_cust_id;
```

*Note: a表分片键cust_id，b表分片键ext_cust_id，两个表分片键名称不同但含义一致。*

**检查方式**：工具检查，中间件自动拦截

### 【强制】分片表关联查询 SQL 上必须带有分片键字段的关联。

**<font color=red>反例</font>**

```sql
SELECT
	e.empName,
	d.deptName 
FROM
	t_employee AS e
	INNER JOIN t_dept AS d ON e.dept = d.id;
```

*Note：e.dept不是分片键字段*

**检查方式**：工具检查，中间件自动拦截

### 【强制】使用UNION关键字的SQL，要求其中涉及分片表的分片规则及分片数一致，使用UNION ALL关键字的SQL则无此要求。

**<font color=red>反例</font>**

```sql
SELECT
	cust_code,
	cust_name 
FROM
	cust AS a 
WHERE
	cust_id = 1 UNION
SELECT
	cust_code,
	cust_name 
FROM
	cust_ext AS b 
WHERE
	cust_id = 2;
```

*Note：a和b表，分片规则不一样，分片数量不一样，语句执行会报错。*

**检查方式**：工具检查，中间件自动拦截

### 【强制】分片表不支持UNION/UNION ALL与聚合函数、LIMIT、GROUP BY、HAVING、ORDER BY等关键字联用。

**<font color=red>反例</font>**

```sql
SELECT
	SUM( score ) 
FROM
	student1 
WHERE
	classname = '1' UNION
SELECT
	SUM( score ) 
FROM
	student2 
WHERE
	classname = '2';
```

*Note：上述SQL不支持，因为UNION不支持与聚合函数SUM联用。*

**检查方式**：工具检查，中间件自动拦截

### 【强制】不支持分片表和全局表UNION。

**<font color=red>反例</font>**

```sql
SELECT
	column_name 
FROM
	tb_partition UNION
SELECT
	column_name 
FROM
	tb_global;
```

*Note：tb_partition为分片表，tb_global为全局表*

**检查方式**：工具检查，中间件自动拦截

### 【强制】 库内分表 间的自连接时，需要以分表字段作为关联条件。

**正例**

```sql
SELECT a.prod_id,a.prod_state
  FROM prod a, prod b
 WHERE a.indep_prod_id = b.prod_id
   AND b.prod_id = 461550
   AND a.routing_id = b.routing_id;
```

*Note：其中routing_id为分表键*

**检查方式**：工具检查，中间件自动拦截

### 【强制】不支持包含 库内分表的UNION运算，比如两个库内分表，库内分表与分片表，库内分表与全局表。

**<font color=red>反例</font>**

例1：

```sql
SELECT
	column_name 
FROM
	tb_kn_1 UNION
SELECT
	column_name 
FROM
	tb_kn_2;
```

例2：

```sql
SELECT
	column_name 
FROM
	tb_partition_1 UNION
SELECT
	column_name 
FROM
	tb_kn_2;
```

例3：

```sql
SELECT
	column_name 
FROM
	tb_global UNION
SELECT
	column_name 
FROM
	tb_kn_2;
```

*Note：tb_kn_1, tb_kn_2为库内分表，tb_partition_1为分片表，tb_global为全局表*

**检查方式**：工具检查，中间件自动拦截

### 【强制】不支持包含 库内分表 的UNION/UNION ALL与聚合函数、LIMIT、GROUP BY、HAVING、ORDER BY等关键字联用。

**<font color=red>反例</font>**

```sql
SELECT
	'_200306',
	count( 1 ) AS SUFFIX_COUNT 
FROM
	CIC_CUST_CONTACT_200306 T,
	CIC_EVENT E 
WHERE
	T.EVENT_ID = E.EVENT_ID 
	AND T.STATE = 'SUB' 
	AND E.EVENT_CODE IN ( 'MCCM_SEND_SMS' ) UNION ALL
SELECT
	'_200305',
	count( 1 ) AS SUFFIX_COUNT 
FROM
	CIC_CUST_CONTACT_200305 T,
	CIC_EVENT E 
WHERE
	T.EVENT_ID = E.EVENT_ID 
	AND T.STATE = 'SUB' 
	AND E.EVENT_CODE IN ( 'MCCM_SEND_SMS' );
```

*Note： CIC_CUST_CONTACT_xxx是库内分表*

**检查方式**：工具检查，中间件自动拦截

### 【强制】不支持在包含分片表或库内分表的SQL中使用包含聚合函数及运算的表达式（诸如count(*)+100）。

**<font color=red>反例</font>**

例1：

```sql
SELECT
	count(*) + 100
FROM
	tb_kn_1
```

例2：

```sql
SELECT
	'20200511' sttl_dt,
	'22' biz_pkg,
	f.serv_carrier_cd,
	f.partner_carrier_cd,
	'6' pa,
	SUM( f.data_down + f.data_up ) / ( 1024 * 1024 ) 
FROM
	tb_partition_1 AS f 
GROUP BY
	f.serv_carrier_cd,
	f.partner_carrier_cd
```

例3：

```sql
SELECT
	'20200511' sttl_dt,
	'22' biz_pkg,
	f.serv_carrier_cd,
	f.partner_carrier_cd,
	'8' pa,
	COUNT(
	DISTINCT ( f.imsi )) 
FROM
	tb_kn_2 AS f 
GROUP BY
	f.serv_carrier_cd,
	f.partner_carrier_cd
```

*Note：tb_kn_1, tb_kn_2为库内分表，tb_partition_1为分片表*

**检查方式**：工具检查，中间件自动拦截

### 【强制】不支持子查询中 库内分表 的数量大于1。

**<font color=red>反例</font>**

```sql
SELECT
	a.CODE,
	c.NAME 
FROM
	a,
	( SELECT b.NAME FROM b, d WHERE b.id = d.id ) c 
WHERE
	a.id = c.id;
```

*Note：其中b和d表都为库内分表，是不允许的。*

**检查方式**：工具检查，中间件自动拦截

### 【强制】不支持包含 库内分表的子查询中使用包含聚合函数及运算的表达式（诸如count(*)+''）。

**<font color=red>反例</font>**

```sql
SELECT
	t1.NAME,
	t1.DESC 
FROM
	answers AS t1 
WHERE
	t1.answer_id LIKE TRIM((
		SELECT
			COUNT(*) + '' 
		FROM
		users AS t2 
	));
```

*Note：其中answers和users表都为库内分表。*

**检查方式**：工具检查，中间件自动拦截

### 【强制】不支持包含 库内分表 的子查询中使用UNION/UNION ALL。

**<font color=red>反例</font>**

```sql
SELECT
	t1.NAME,
	t1.DESC 
FROM
	answers AS t1,
	( SELECT id FROM users LIMIT 3 UNION ALL SELECT id FROM tags LIMIT 3 ) AS t3,
	t_order AS t4 
WHERE
	0 = 1;
```

*Note：其中answers和users表都为库内分表。*

**检查方式**：工具检查，中间件自动拦截

### 【强制】不支持 库内分表 子查询中包含与主SQL的关联条件，且包含LIMIT/ORDER BY/ GROUP BY/ HAVING 关键字。

**<font color=red>反例</font>**

```sql
SELECT
	a.NAME,
	a.CODE 
FROM
	tags AS a 
WHERE
	EXISTS ( SELECT 1 FROM users_tags AS b WHERE a.tag_id = b.tag_id ORDER BY b.user_id DESC LIMIT 1 ) 
	AND a.tag_id = 25
```

*Note：其中users、users_tags为库内分表。*

**检查方式**：工具检查，中间件自动拦截

### 【强制】不支持DELETE、UPDATE语句中使用包含 库内分表 的子查询。

**<font color=red>反例</font>**

```sql
DELETE 
FROM
	customer 
WHERE
	id IN ( SELECT id FROM salaries WHERE id > 10000 );
```

*Note：其中salaries为库内分表，customer为普通分片表*

正例

```sql
DELETE 
FROM
	salaries 
WHERE
	id IN ( SELECT id FROM customer WHERE id > 10000 );
```

*Note：其中salaries为库内分表，customer为普通分片表*

**检查方式**：工具检查，中间件自动拦截

### 【强制】不支持DELETE、UPDATE语句包含 库内分表 在内的多表操作。

**<font color=red>反例</font>**

例1：

```sql
DELETE t1.sal_val,
t2.NAME 
FROM
	salaries t1,
	customer t2 
WHERE
	t1.id = t2.id 
	AND t1.id < 1000;
```

例2：

```sql
UPDATE salaries t1,
customer t2 
SET t1.id = t2.id 
WHERE
	t1.id = t2.id 
	AND t1.id < 1000;
```

*Note：其中salaries为库内分表，customer为普通分片表*

**检查方式**：工具检查，中间件自动拦截

### 【推荐】【ZDAAS V4】对分片表的查询，查询列里应该包含GROUP BY、ORDER BY的字段。

**说明：**

ZDAAS V4支持对查询进行补列，但在有些复杂SQL场景下，补列可能失效，查询时也会报错，因此建议加上。

**<font color=red>反例</font>**

例1：

```sql
SELECT
	SUM( e.sal ) 
FROM
	emp AS e
WHERE e.route_id = 1
GROUP BY
	e.deptno
```

Note：其中deptno为库内分表

例2：

```sql
SELECT
  A.BIZ_CUST_ID,
  A.BUSINESS_TYPE,
  A.LANDLINE_NUMBER,
  B.CUST_ID,
  B.CUST_CODE,
  B.CUST_NAME,
  B.SECOND_NAME,
  B.THIRD_NAME
FROM BIZ_CUST_HIS A,
  CUST_HIS B
WHERE A.BIZ_CUST_ID = B.CUST_ID
    AND A.ROUTING_ID = B.ROUTING_ID
    AND A.SEQ = B.SEQ
    AND A.BIZ_CUST_ID = 2041235
    AND A.ROUTING_ID = 2
ORDER BY A.SEQ;
```

*Note：其中salaries为库内分表，customer为普通分片表*

**正例**

例1：

```sql
SELECT
    e.deptno,
	SUM( e.sal ) 
FROM
	emp AS e
WHERE e.route_id = 1
GROUP BY
	e.deptno
```

Note：其中deptno为库内分表

例2：

```sql
SELECT
  A.SEQ
  A.BIZ_CUST_ID,
  A.BUSINESS_TYPE,
  A.LANDLINE_NUMBER,
  B.CUST_ID,
  B.CUST_CODE,
  B.CUST_NAME,
  B.SECOND_NAME,
  B.THIRD_NAME
FROM BIZ_CUST_HIS A,
  CUST_HIS B
WHERE A.BIZ_CUST_ID = B.CUST_ID
    AND A.ROUTING_ID = B.ROUTING_ID
    AND A.SEQ = B.SEQ
    AND A.BIZ_CUST_ID = 2041235
    AND A.ROUTING_ID = 2
ORDER BY A.SEQ;
```

*Note：其中salaries为库内分表，customer为普通分片表*

**检查方式**：人工检查

### 【强制】【ZDAAS V4】对分片表的查询时不建议使用CASE WHEN、GROUP_CONCAT、CAST、CONVERT函数

**说明：**

ZDAAS V4对分片表查询SQL解析时，对上述函数支持的不好，可能导致解析失败。

**检查方式**：人工检查，中间件审计

### 【强制】【ZDAAS V4】查询语句不支持冗余括号

**<font color=red>反例</font>**

```sql
select
	A.PROD_ID,
	A.ATTR_ID,
	A.EFF_DATE,
	A.EXP_DATE,
	B.INPUT_TYPE,
	A.VALUE 'KEY'
from
	PROD_ATTR_VALUE A
left join ATTR_VALUE D on
	A.ATTR_ID = D.BASE_ATTR_ID
	and A.VALUE = D.VALUE,
	BASE_ATTR B
where
	A.PROD_ID = 1083007
	and A.ATTR_ID = B.BASE_ATTR_ID
	and (A.EXP_DATE is null
		 and DATE_FORMAT(A.EXP_DATE, '%Y-%m-%d') > DATE_FORMAT(NOW(), '%Y-%m-%d'))
```

**正例**

```sql
select
	A.PROD_ID,
	A.ATTR_ID,
	A.EFF_DATE,
	A.EXP_DATE,
	B.INPUT_TYPE,
	A.VALUE 'KEY'
from
	PROD_ATTR_VALUE A
left join ATTR_VALUE D on
	A.ATTR_ID = D.BASE_ATTR_ID
	and A.VALUE = D.VALUE,
	BASE_ATTR B
where
	A.PROD_ID = 1083007
	and A.ATTR_ID = B.BASE_ATTR_ID
	and A.EXP_DATE is null
		 and DATE_FORMAT(A.EXP_DATE, '%Y-%m-%d') > DATE_FORMAT(NOW(), '%Y-%m-%d')
```

**检查方式**：人工检查

### 【强制】【ZDAAS V4】不支持INSERT SELECT语句

**<font color=red>反例</font>**

```sql
INSERT INTO deptno_his (deptno, sal) SELECT deptno, sal FROM deptno WHERE deptno = 1
```

**检查方式**：人工检查

### 【强制】【ZDAAS V4】路由至多节点执行的SQL不支持聚合函数嵌套

**说明：**

ZDAAS V4只解析外层函数，因此识别不到嵌套在里层的聚合函数，在路由至多节点执行后不会做聚合。

**<font color=red>反例</font>**

```sql
SELECT IFNULL(MAX(SEQ),0) + 1 AS NEXT_SEQ FROM WF_WORK_ORDER_HIS H WHERE H.WORK_ORDER_ID=1013 AND H.ROUTING_ID=0
```

Note：其中WF_WORK_ORDER_HIS为库内分表

**正例**

```sql
SELECT MAX(IFNULL(SEQ, 0) + 1) AS NEXT_SEQ FROM WF_WORK_ORDER_HIS H WHERE H.WORK_ORDER_ID=1013 AND H.ROUTING_ID=0
```

同时，考虑到IFNULL的特殊作用，应用程序也要考虑正例里返回结果集为空的场景。

**检查方式**：人工检查

### 【强制】【ZDAAS V4】INSERT语句不支持双引号

**<font color=red>反例</font>**

```sql
INSERT INTO OFFER_CATG (OFFER_CATG_ID, "OFFER_CATG_TYPE", "OFFER_CATG_CLASS", "OFFER_CATG_NAME", "COMMENTS"
  , "OFFER_CATG_CODE", "EFF_DATE", "EXP_DATE", "STATE", "STATE_DATE"
  , "CREATED_DATE", "SP_ID", "POLICY_FLAG", "SEQ")
VALUES (1, '4', 'A', 'Mobile phone', NULL
  , 'Mobile phone', now(), NULL, 'A', now()
  , now(), '0', NULL, '1');
```

**正例**

```sql
INSERT INTO OFFER_CATG (OFFER_CATG_ID, OFFER_CATG_TYPE, OFFER_CATG_CLASS, OFFER_CATG_NAME, COMMENTS
  , OFFER_CATG_CODE, EFF_DATE, EXP_DATE, STATE, STATE_DATE
  , CREATED_DATE, SP_ID, POLICY_FLAG, SEQ)
VALUES (1, '4', 'A', 'Mobile phone', NULL
  , 'Mobile phone', now(), NULL, 'A', now()
  , now(), '0', NULL, '1');
```

**检查方式**：人工检查，中间件拦截

## 跨节点操作约束

### 【强制】不使用跨节点操作（增删改）的分布式事务。

**说明**

引入分布式后，根据CAP理论，强一致性与可用性不可兼得，事务边界越大，那么系统的锁冲突概率越高，系统越难以扩展，性能也越低。因此一般工程实践中 ，若想将系统做到很好的扩展性，解决分布式事务最好的方法就是尽量规避分布式事务， 一个最重要的原则就是业务侧想办法划小事务边界，并尽可能让事务的边界限制在单实例MySQL内。**业务侧需考虑如何保证业务数据整体的一致性**。

现有分布式现状：

DRDS 支持，但不推荐使用

UDAL 支持，但不推荐使用

ZDaas 不支持

ZDaas-JDBC 不支持

**<font color=red>反例</font>**

```sql
UPDATE customer t2 
SET t2.state = ’ 00A’ 
WHERE
	type = ’ A’;
```

*Note：其中customer为普通分片表,分片字段为id*

**检查方式**：人工检查

**故障单参考：**

ZMP2381010

## JDBC约束

### 【强制】不支持 rewriteBatchedStatements=true 参数设置(默认为false)。

**<font color=red>反例</font>**

```java
jdbc:mysql://ip:port/db?rewriteBatchedStatements=true
```

**检查方式**：工具检查，中间件自动拦截

### 【强制】不支持 useServerPrepStmts=true 参数设置(默认为 false)。

**<font color=red>反例</font>**

```java
jdbc:mysql://ip:port/db?*useServerPrepStmts*=true
```

**检查方式**：工具检查，中间件自动拦截

### 【强制】BLOB, BINARY, VARBINARY 字段不能使用 setBlob() 或setBinaryStream() 方法设置参数。

**检查方式**：工具检查，中间件自动拦截

## 性能优化

### 【强制】库内分表间禁止使用LEFT JOIN/RIGHT JOIN/INNER JOIN；【违反结果】慢查询。

**<font color=red>反例</font>**

```sql
SELECT
	t1.a,
	t2.b 
FROM
	test_ml AS t1,
	test_ml0 AS t2 
WHERE
	t1.b = t2.b;
```

*Note: test_ml和test_ml0是库内分表，b是分表*

**正例**

拆成2个SQL:

```sql
mysql> select b from test_ml0 where b<4; 
mysql> select a from test_ml where b in (0,1,2,3);
```

**检查方式**：人工检查

### 【强制】禁止UNION、UNION ALL中使用两个及两个以上的库内分表的场景；【违反结果】可能导致性能低。

**<font color=red>反例</font>**

```sql
SELECT
	b 
FROM
	test_ml0 UNION
SELECT
	b 
FROM
	test_ml;
```

*Note：test_ml0和test_ml是库内分表*

**检查方式**：人工检查

### 【强制】查询语句中必须带上分片键，避免广播语句产生；【违反结果】广播查询，降低查询速度，增加数据库负载。

*备注：低频业务可以例外，比如：人工点击的查询界面 或者 不经常执行的 JOB。*

**<font color=red>反例</font>**

```sql
SELECT
	cust_id,
	routing_id 
FROM
	subs 
WHERE
	subs_id = 32100;
```

*Note：subs表的分片键routing_id，where查询条件没有加分片键；*

**正例**

```sql
SELECT
	cust_id,
	routing_id 
FROM
	subs 
WHERE
	subs_id = 32100 
	AND routing_id = 1;
```

*Note：subs表的分片键routing_id*

**检查方式**：工具检查（UDAL和Sharding-jdbc都提供了审计工具）

**故障参考**：ZMP2543759

### 【推荐】子查询若包含库内分表，使用UNION ALL的形式组合子查询内的SQL，建议尽量使用JOIN的写法来替代子查询写法；【违反结果】查询响应时间长，数据库性能消耗高。

**<font color=red>反例</font>**

```sql
SELECT
	a.id 
FROM
	t1 AS a,
	(
	SELECT
		b.id 
	FROM
		t2 AS b,
		t3 AS c 
	WHERE
		b.id = c.id 
		AND c.tb_id = 3 UNION ALL
	SELECT
		b.id 
	FROM
		t2 AS b,
		t4 AS d 
	WHERE
		b.id = d.id 
		AND d.id = 4 
	) t5 AS s 
WHERE
	s.id = a.id;
```

*Note：t1，t2，t4是单片表，t3是库内分表，tb_id为分表键*

**正例**

```sql
SELECT
	a.id 
FROM
	a AS t1,
	b AS t2,
	c AS t3 
WHERE
	a.id = b.id 
	AND a.id = c.id 
	AND c.tb_id = 3 UNION ALL
SELECT
	a.id 
FROM
	a AS t1,
	b AS t2,
	d AS t4 
WHERE
	a.id = b.id 
	AND a.id = d.id 
	AND d.id = 4;
```

*Note： t1，t2，t4是单片表，t3是库内分表，tb_id为分表键*

**检查方式**：人工检查

### 【推荐】分表或分片字段尽量建立物理数据库索引，以提升查询速度；【违反结果】查询响应时间长，数据库性能消耗高。

**<font color=red>反例</font>**

```sql
CREATE TABLE
IF
	NOT EXISTS `test_ml` (
		`a` INT ( 11 ) NOT NULL,
		`b` INT ( 11 ) NOT NULL COMMENT 'a',
		`c` INT ( 11 ) NOT NULL COMMENT 'c',
		PRIMARY KEY ( `a` ) 
	) ENGINE = INNODB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_bin;

/*sharding语句*/
sharding @@TABLE NAME = 'test_ml' 
SET type = 'inner' 
AND inner_sharding_algo = 'PartitionByMod' 
AND inner_sharding_id = 'b' 
AND inner_total = '10' 
AND dn = 'coc_2';
```

![image](uploads/4064/7c83d478-0d0d-440d-b019-70489dd259f5/dev_mysql_3.5.5_1.png)

*Note：test_ml表，分表键b没有建索引，执行计划没有用上索引；*

**正例**

```sql
CREATE TABLE
IF
	NOT EXISTS `test_ml` (
		`a` INT ( 11 ) NOT NULL,
		`b` INT ( 11 ) NOT NULL COMMENT 'a',
		`c` INT ( 11 ) NOT NULL COMMENT 'c',
		PRIMARY KEY ( `a` ),
		KEY `idx_b` ( `b` ) 
	) ENGINE = INNODB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_bin;

/*sharding语句*/
sharding @@TABLE NAME = 'test_ml' 
SET type = 'inner' 
AND inner_sharding_algo = 'PartitionByMod' 
AND inner_sharding_id = 'b' 
AND inner_total = '10' 
AND dn = 'coc_2';
```

![image](uploads/4064/ff5cbcb1-b0ef-4c68-9119-ef0f8b09f90b/dev_mysql_3.5.5_2.png)

*Note：test_ml表，分表键b有建索引，执行计划有用上b的索引；*

**检查方式**：人工检查

## 中间件特性约束

### 【推荐】对于不支持长连接的数据库，需要考虑数据库长时间不访问可能断链的问题。

**说明**：

例如：UDAL数据库不支持长连接，对于没有连接池管理的应用，需要自行实现数据库的心跳机制，否则会引起断链问题。

**故障单参考**：ZMP2247178
