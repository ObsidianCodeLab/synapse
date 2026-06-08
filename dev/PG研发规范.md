# 概述

## 编写目的

- 编写高效的SQL语句和使用合适的方式创建表和索引，以达到系统在不断更新和升级时仍能保持良好的稳定性。
- 增强SQL可维护性。

## 适用范围

适用于Postgresql V12.x及以上版本。

## 角色和职责

**开发人员**：负责按照规范进行SQL编码

**运维人员**：负责根据规范编写运维需要的SQL

# SQL开发规范

## 索引使用规范

【**${\color{red}强制}$**】SQL语句禁止使用非同类型的列进行等值查询，并且不要做类型转换。（人工检查）

**注：** 字段类型不同会造成隐式转换，导致索引失效。

【**${\color{red}强制}$**】普通索引列作为查询条件时，不允许对索引列进行计算；表达式索引使用时需要与建立索引的表达式保持一致。（人工检查）

【**${\color{red}强制}$**】对于复合索引，SQL语句的where查询条件必须有使用索引的第一列，复合列数量推荐不超过3个。（人工检查）

【**${\color{red}强制}$**】表结构中字段定义的数据类型与应用程序中的定义保持一致，避免报错或无法使用索引的情况发生。（人工检查）

【**${\color{red}强制}$**】创建索引时加concurrently关键字，就可以并行创建（会有额外的资源消耗），不会堵塞DML操作，否则会堵塞DML操作。（人工检查）

例如：

```sql
create index concurrently idx on tbl(id);
```

【**${\color{green}建议}$**】在创建索引时，可以使用TABLESPACE子句指定索引存储在单独的表空间中，这样可以将索引和表数据分开存储，有助于性能优化。

【**${\color{green}建议}$**】创建主键约束会自动创建一个唯一索引，唯一索引可以确保索引列的值唯一，由于在PostgreSQL中，不同的NULL值被视为不相等，因此唯一索引列允许包含多个NULL值（PG支持NULL值索引（`CREATE INDEX ... NULLS NOT DISTINCT`），但需评估必要性。）。

【**${\color{green}建议}$**】对查询进行优化，应尽量避免全表扫描，首先应考虑在 where 及 order by 涉及的列上建立索引。

**注：** 使用explain可以查看执行计划，如果发现执行计划不优，可以通过索引或者调整查询的写法来解决。

```sql
begin;

explain (verbose,costs,timing,buffers,analyze) SQL语句;

rollback;
```

【**${\color{green}建议}$**】对where中含多个字段条件的高频查询，结合数据分布情况，创建多个字段的联合索引，联合索引区分度高的列需要放到前面。

【**${\color{green}建议}$**】创建索引时使用INCLUDE子句允许在索引中包含非键列，这些列不会作为索引键，但可以用于索引扫描，在索引扫描时可以直接从索引中获取这些列的值，避免回表。

【**${\color{green}建议}$**】对于值与堆表的存储顺序线性相关的数据，如果通常的查询为范围查询，建议使用BRIN（Block Range Index）索引。例如流式数据，时间字段或自增字段，可以使用BRIN索引，减少索引的大小，加快数据插入速度：

```sql
create index idx on tbl using brin(id);
```

BRIN（Block Range Index）索引存储连续数据块的范围摘要，适合非常大的表，且数据按时间顺序插入的情况。它占用空间小，但不适合频繁更新或无序的数据。

【**${\color{green}建议}$**】当业务有近邻查询的需求时，推荐对字段建立GIST或SP-GIST索引，加速近邻查询的需求。

例如：

```sql
create index idx on tbl using gist(col);  
select * from tbl order by col <-> '(0,100)';  

-- 使用范围类型存储IP地址段，使用包含的GIST索引检索，性能比两个字段的between and提升20多倍：
create table ip_address_pool_3 (  
  id serial8 primary key ,  
  start_ip inet not null ,  
  end_ip inet not null ,  
  province varchar(128) not null ,  
  city varchar(128) not null ,  
  region_name varchar(128) not null ,  
  company_name varchar(128) not null ,  
  ip_decimal_segment int8range  
) ;  
  
create index ip_address_pool_3_range on ip_address_pool_3 using gist (ip_decimal_segment);  
  
select province,ip_decimal_segment  from ip_address_pool_3 where ip_decimal_segment @> :ip::int8;
```

【**${\color{green}建议}$**】对于固定条件的查询，可以使用部分索引，减少索引的大小，同时提升查询效率，例如：

```sql
select * from tbl where id=1 and col=?; -- 其中id=1为固定的条件  
create index idx on tbl (col) where id=1;
```

【**${\color{green}建议}$**】对于经常使用表达式作为查询条件的语句，可以使用表达式或函数索引加速查询，例如：

```sql
select * from tbl where exp(xxx);  
create index idx on tbl ( exp );
```

【**${\color{green}建议}$**】当用户有prefix或者 suffix的模糊查询需求时，可以使用索引，或反转索引达到提速的需求，例如：

```sql
select * from tbl where col ~ '^abc';  -- 前缀查询
create index idx on tbl(reverse(col)) -- 创建反转函数索引
select * from tbl where reverse(col) ~ '^def';  -- 后缀查询使用反转函数索引
```

【**${\color{green}建议}$**】当用户有规则表达式查询，或者文本近似度查询的需求时，建议对字段使用trgm的gin索引，提升近似度匹配或规则表达式匹配的查询效率，同时覆盖了前后模糊的查询需求。如果没有创建trgm gin索引，则不推荐使用前后模糊查询例如like %xxxx%。

```sql
create index idx_tab_colname on 表名 using gin(colname gin_trgm_ops);
```

【**${\color{green}建议}$**】对于全文搜索场景，推荐通过对字段建立GIN索引或者GIST索引进行优化，对于中文模糊查询场景，推荐安装zhparser中文分词插件进行优化：
1、下载zhparser源码并进行编译；

2、登陆pg控制台使用 `CREATE EXTENSION zhparser`启用插件；

3、添加分词配置：

```sql
create text search configuration parser_name (parser = zhparser); // 添加配置
alter text search configuration parser_name add mapping for n,v,a,i,e,l,j with simple; // 设置分词规则 （n 名词 v 动词等）
```

4、给某一列的分词结果添加 gin 索引 `create index idx_name on table using gin(to_tsvector('parser_name', field));`

5、根据实际情况在 `postgresql.conf`添加配置：

```markdown
zhparser.multi_short = true #短词复合: 1
zhparser.multi_duality = true  #散字二元复合: 2
zhparser.multi_zmain = true  #重要单字复合: 4
zhparser.multi_zall = false  #全部单字复合: 8
```

参考链接：[https://developer.aliyun.com/article/7730](https://developer.aliyun.com/article/7730)

【**${\color{green}建议}$**】当数据被大量更新或删除后，索引可能会产生碎片，导致性能下降，此时应该重建索引（此外，重建索引可以解决索引膨胀问题，可以考虑定期进行重建）。PostgreSQL提供了REINDEX命令来重建索引，不需要停止数据库，但是重建期间会进行锁表，生产环境执行需谨慎。

【**${\color{green}建议}$**】对象文本类型可以考虑用JSONB字段类型进行存储，PostgreSQL 支持 `JSON` 和 `JSONB` 两种 JSON 类型：
- **`JSON`**：存储为 **纯文本**，查询时需要解析，效率较低。
- **`JSONB`**：存储为 **二进制格式**，支持索引，查询性能更好。（推荐）

查询JSON中的某个key值：

```sql
-- -> 返回 JSON 类型
SELECT params->'name' FROM demo_json;

-- ->> 返回 TEXT 类型
SELECT params->>'name' FROM demo_json;

-- 查询 JSON 数组中的元素，返回第一个元素
SELECT params->'skills'->0 FROM demo_json;
```

条件查询：

```sql
-- 查询 JSON 中包含某个值
SELECT * FROM demo_json WHERE params->>'name' = 'Alice';

-- 查询 JSON 数字值
SELECT * FROM demo_json WHERE (params->>'age')::INT > 25;

-- 查询 JSON 布尔值
SELECT * FROM demo_json WHERE (params->>'is_active')::BOOLEAN = true;

-- 查询 JSON 中 null 值
SELECT * FROM demo_json WHERE params->>'salary' IS NULL;
```

`JSON`字段类型本身不支持索引，必须用 **表达式索引** 才能加速查询：

```sql
CREATE INDEX idx_json_name ON demo_json ((params->>'name'));
```

`JSON`独有的高级查询：

```sql
-- 使用 @> 进行 JSONB 包含查询: 查询 params 是否包含 {"age": 25}
SELECT * FROM demo_jsonb WHERE params @> '{"age": 25}';

-- 查询 JSONB 数组是否包含某个值
SELECT * FROM demo_jsonb WHERE params->'skills' ? 'Java';

-- 查询 JSONB 数组是否包含至少值
SELECT * FROM demo_jsonb WHERE params->'skills' ?| array['Java', 'Python'];

-- 查询 JSONB 数组是否包含所有值
SELECT * FROM demo_jsonb WHERE params->'skills' ?& array['Java', 'SQL'];

-- 更新 JSONB 的某个key值
UPDATE demo_jsonb 
SET params = jsonb_set(params, '{age}', '40') 
WHERE params->>'name' = 'Alice';
```

`JSONB`字段类型支持`BTREE`、`GIN`索引进行加速查询：

```sql
CREATE INDEX idx_jsonb_name ON demo_jsonb USING GIN (params);
```

## SQL规约

### 查询限制

【**${\color{red}强制}$**】当只需要查询一行数据时使用LIMIT 1。（人工检查）

【**${\color{red}强制}$**】对数据库的批量增删改操作，应拆分成多个事务进行操作，每次不超过 5000 条记录。（人工检查）

【**${\color{red}强制}$**】10万数据量以上的大表禁止使用没有where条件的查询（报表等低频场景例外）。（人工检查）

【**${\color{red}强制}$**】查询禁止使用“select *”这样的语句，不要返回用不到的任何字段。会影响优化器对执行计划的选择，也会增加宝贵的硬件资源消耗。另外表结构发生变化也容易出现问题。特别是在程序代码内部。即使需要查询表中的所有列时，也需列出所有的字段名。例外场景：对子查询结果集进行的外层嵌套查询可以用select *（人工检查）

【**${\color{red}强制}$**】分区表查询必须带上分区键作为查询条件。（人工检查）

【**${\color{green}建议}$**】在PostgreSQL中对关键字大小写不敏感，需要使用大写的标志符时，必须要加上双引号，否则会被转为小写。为了提高可读性，建议关键字、表名和列名全部使用小写。

【**${\color{green}建议}$**】表名和列名的别名应该使用有意义的英文单词或缩写，不能包含空格，非必要情况下不要使用拼音或者中文。

【**${\color{green}建议}$**】限制单个事务所操作的数据集大小，单个事务查询结果不超过10000条，批量增删改场景下操作对象不超过5000条。

**注：** 大数据量，过滤条件未加索引，且事先知道结果只有一条记录时使用limit 1，可加快执行效率。

【**${\color{green}建议}$**】避免超长SQL，建议长度不超过4000字符。

**注：** 超长SQL往往导致难以理解，并可能伴随性能隐患。同时，应尽量减少SQL语句复杂度，用简单的SQL完成任务，复杂的业务逻		辑尽量由业务代码来实现。

【**${\color{green}建议}$**】SQL子查询嵌套不宜超过3层

**注：** 禁止使用多层的SQL嵌套，除了分页查询，一般SQL语句建议不超过3层嵌套，过于复杂的SQL可根据业务逻辑拆分为多条SQL来实现。

【**${\color{green}建议}$**】在PostgreSQL中，子查询（Subquery）是一种在另一个查询内部嵌套的查询。根据子查询是否依赖于外部查询的某些行，子查询可以分为两大类：相关子查询（Correlated Subquery）和非相关子查询（Non-Correlated Subquery），相关子查询依赖于外部查询的某些行。换句话说，子查询中的某些条件或计算是基于外部查询的当前行的。例如：

```sql
select name, salary
from employees e
where salary > (select avg(salary) from employees where department_id = e.department_id);
```

相关子查询可能会因为需要多次执行而产生性能问题，尤其是当外部表很大时。优化相关子查询的一种方法是使用临时表、CTE（公用表表达式）或者将子查询重写为 JOIN 操作，这通常可以提高性能。例如，上述相关子查询可以使用以下 JOIN 方法重写：

```sql
select e.name, e.salary
from employees e
join (select department_id, avg(salary) as avg_salary from employees group by department_id) as dept_avg
on e.department_id = dept_avg.department_id
where e.salary > dept_avg.avg_salary;
```

【**${\color{green}建议}$**】尽量避免多表的关联操作，对于join 实例表的总数量控制在3个及以内，表设计中需要注意关联表之间的设计关系，关联字段类型的数据类型必须一致，建议字段名也应一致，并建立索引加速查询。

**注：** 关联表越多，要调度的资源就越多。SQL应尽量简化，查询类语句只查询业务所需的数据，不查询无关数据表。特别关注数据量		巨大的表关联操作，使用不当会引发系统故障。实际场景中遇到此类问题，建议在设计层面提前设计好数据库宽表或者将需关联数据		抽取到ES、数仓等其他存储介质中，应用程序直接对宽表进行查询。

【**${\color{green}建议}$**】尽量减少外层使用order by 和group by 排序操作。

**注：** 大量的排序操作影响系统性能，如必须使用排序操作，要尽量建立在有索引的列上。

【**${\color{green}建议}$**】避免不必要的排序。

**注：** 避免不必要的排序，对查询结果进行排序会大大降低系统性能。应将大多数的排序工作交给应用层去完成。

【**${\color{green}建议}$**】尽量避免在 where 子句中使用!=或<>操作符，否则引擎放弃使用索引而进行全表扫描。

【**${\color{green}建议}$**】避免使用大表做join、group by分组、排序。

【**${\color{green}建议}$**】尽量减少SQL复杂度。

**注：** 用简单SQL完成任务，复杂的逻辑在代码中实现。对一个大结果集做排序，或者求唯一值，都是比较昂贵的计算，占用大量数据		库系统资源，如果业务上有这方面需求，尽量放在业务代码中实现。

### 计数场景

【**${\color{red}强制}$**】在函数中，或程序中，不要使用count(*)判断是否有数据，很慢。 建议的方法是limit 1; （人工检查）

例如：

```sql
select 1 from tbl where xxx limit 1;  
if found -- 存在  
else  -- 不存在
```

【**${\color{green}建议}$**】选取合适的计数方式：

- `count(*)`是统计行数的标准语法，空值会纳入统计；
- `count(col)`统计的是col列中的非空记录数。该列中的null值不会被计入；
- `count(distinct col)` 对col列除重计数，同样忽视空值，即只统计非空不同值的个数；
- `count((col1, col2))`对多列计数，即使待计数的列全为空也会被计数，`(null,null)`有效；
- `count(distinct (col1, col2))`对多列除重计数，即使待计数列全为空也会被计数，`(null,null)`有效；

### 空值场景

【**${\color{green}建议}$**】注意以下各种空值的场景处理

- 【**${\color{red}强制}$**】明确区分零值与空值，空值使用is null进行等值判断，零值使用常规的=运算符进行等值判断。（人工检查）

- 注意空值比较逻辑：任何涉及到空值比较运算结果都是unknown，需要注意unknown参与布尔运算的逻辑：

  · and：`true or unknown`会因为逻辑短路返回 `true`。
  · or：`false and unknown`会因为逻辑短路返回 `false`
  其他情况只要运算对象出现 `unknown`，结果都是 `unknown`。

- 空值与任何值的逻辑判断，其结果都为空值，例如 `null=null`返回结果是 `null`而不是 `true/false`。

- 【**${\color{green}建议}$**】涉及空值与非空值的等值比较，请使用 `is distinct from` 进行比较，保证比较结果非空。（人工检查）

- 注意聚合函数的空值问题，除了count之外的所有聚合函数都会忽略空值输入，因此当输入值全部为空时，结果是NULL，如果聚集函数返回空并不是期望的结果，使用coalesce来设置缺省值。

### 判断是否存在场景

【**${\color{green}建议}$**】IN操作能避免则避免，若使用需评估 `in`后边的集合元素数量控制在 50个之内。

**注：** 可以用`exist`代替 `in`，`exist`在某些场景比 `in`效率高。

```sql
select num from a where num in (select num from b);
-- 用下面的语句替换：
select num from a where exists(select 1 from b where num=a.num)
```

【**${\color{green}建议}$**】使用 `=any(array[1,2,3,4])`代替 `in (1,2,3,4)`，效果更佳

【**${\color{green}建议}$**】尽量不使用 `not in`。

【**${\color{green}建议}$**】使用 `select 1 from tbl where xxx limit 1`判断是否存满足条件的列，要比 `count`快。

【**${\color{green}建议}$**】可以使用 `select exists(select * FROM app.sjqq where xxx limit 1)`将存在性结果转换为布尔值。

### 递归场景

【**${\color{green}建议}$**】树形查询应该使用递归查询，尽量减少数据库的交互或join，例如：

```sql
create table tbl_test  
(  
id    numeric,  
name text,  
pid   numeric                                  default 0  
);  
insert into tbl_test(id,name,pid) values('1','10','0');  
insert into tbl_test(id,name,pid) values('2','11','1');  
insert into tbl_test(id,name,pid) values('3','20','0');  
insert into tbl_test(id,name,pid) values('4','12','1');  
insert into tbl_test(id,name,pid) values('5','121','2');  

-- 从Root往树末梢递归
with recursive t_result as (  
  select * from tbl_test where id=1  
    union all  
  select t2.* from t_result t1 join tbl_test t2 on t1.id=t2.pid  
)  
select * from t_result;  
  
 id | name | pid   
----+------+-----  
  1 | 10   |   0  
  2 | 11   |   1  
  4 | 12   |   1  
  5 | 121  |   2  
(4 rows)  

-- 从末梢往树ROOT递归
with recursive t_result as (  
  select * from tbl_test where id=5  
    union all  
  select t2.* from t_result t1 join tbl_test t2 on t1.pid=t2.id  
)  
select * from t_result;  
  
 id | name | pid   
----+------+-----  
  5 | 121  |   2  
  2 | 11   |   1  
  1 | 10   |   0  
(3 rows)
```

递归查询的注意事项 ：

1、一定要能跳出循环，即循环子句查不到结果为止；

2、树形结构如果有多个值，则会出现查到的结果比实际的多的情况，这个业务上是需要保证不出现重复的。

### 其他场景

【**${\color{red}强制}$**】在代码中写分页查询逻辑时，若count为0应直接返回，避免执行后面的分页语句。 （人工检查）

【**${\color{red}强制}$**】分页查询中的子查询必须要进行order by排序。 （人工检查）

【**${\color{green}建议}$**】在PostgreSQL中，`||`操作符是标准的字符串连接操作符，推荐使用。`concat`函数也可以使用，但`||`更简洁。

【**${\color{green}建议}$**】PostgreSQL提供了丰富的日期时间函数，常见场景使用方法推荐：时区转换（例如`AT TIME ZONE`），`current_date`获取当前日期，now()函数获取当前时间戳，以及对日期和时间进行加减计算：

```sql
-- 这条SQL语句首先将时间值转换为UTC时区，然后再转换回美国纽约的时区
SELECT TIMESTAMP '2023-01-01 08:00:00' AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York';

-- 获取当前日期，返回格式为：YYYY-MM-DD
select current_date;

-- 获取当前时间戳，返回样例为：2025-07-21 16:00:00.168784 +00:00
select now();
```

【**${\color{green}建议}$**】聚合函数（如`SUM`, `AVG`, `COUNT`等）会忽略NULL值，使用时需要注意。例如，`COUNT(column)`只计算非NULL值。

【**${\color{green}建议}$**】合理选择 `union all`与 `union`。

**注：**` union`会对所产生的结果集进行排序运算，删除重复的记录再返回结果，如果表数据量大的话可能会导致用磁盘进行排序。		`union all`操作只是简单的将两个结果合并后就返回，所以可能存在重复记录。

【**${\color{green}建议}$**】利用`row_number`窗口函数优化超多分页场景，窗口函数不会改变结果集的行数，它只是为每一行计算一个值，基于与当前行相关的行集。

**注：** limit N offset M 。PG是取 M+N行，然后放弃前 M行，返回N行，当 M特别大的时候，效率非常低，要么控制返回的总页数，要		么对超过特定阈值的页数进行 SQL改写。

```sql
-- 普通分页查询写法
select *
from your_table
order by some_column
limit m offset (n - 1) * m;

-- 大分页场景可用以下写法优化：
with numbered_rows as (
select *, row_number() over (order by column_name) as row_num
from your_table
)

select *
from numbered_rows
where row_num between (n - 1) * m + 1 and n * m;
```

【**${\color{green}建议}$**】如果用户需要在插入数据，删除数据，或修改数据后马上拿到插入或被删除或修改后的数据，建议使用 `insert into .. returning ..`; `delete .. returning ..`或 `update .. returning ..`; 语法，减少数据库交互次数。

```sql
insert into test (first_name, last_name, age, salary)
values ('Eve', 'Wilson', 45, 90000.00)
returning id, first_name, last_name, age, salary;
```

【**${\color{green}建议}$**】可以使用`insert into ... select`或者`copy`操作（`copy`导出到文件再导入表，性能比`insert`更好）从另一个表快速批量插入数据，注意批量插入数据时，应该使用事务来包裹。

## 应用程序规约

【**${\color{red}强制}$**】两阶段提交的事务，要及时提交或回滚，否则可能导致数据库膨胀。（人工检查）

【**${\color{red}强制}$**】代码中使用 prepared statement 对象，只传参数，比传递 SQL 语句更高效；一次解析，多次使用；降低SQL 注入概率。（人工检查）

【**${\color{red}强制}$**】事务要简单，尽量避免长事务，长事务可能造成垃圾膨胀或锁争用。特殊场景比如：批量增、删、改或者连续修改单行数据场景下可以考虑开启长事务，其他场景建议单条语句执行完之后立即提交事务。（人工检查）

【**${\color{red}强制}$**】对于高并发的应用场景，务必使用程序的连接池，否则性能会很低下。 如果程序没有连接池，建议在应用层和数据库之间架设连接池，例如使用pgbouncer或者pgpool-II作为连接池。（人工检查）
- 连接池应该设置合适的最大连接数，以防止连接过多，避免超过数据库的最大连接数限制；
- 连接池应该设置最大空闲超时时间，防止连接泄漏；
- 连接池应设置最小连接数避免冷启动，并使用 `SET SESSION` 初始化连接参数；
- 自动提交通常开启（显式事务除外）；

【**${\color{red}强制}$**】禁用默认超级用户，业务角色权限分配应遵循最小权限原则，禁用 `PUBLIC` 默认权限：（人工检查）

```sql
ALTER ROLE postgres RENAME TO <unique_superuser_name>;
ALTER ROLE <unique_superuser_name> WITH NOSUPERUSER; -- 按需降权

REVOKE ALL ON DATABASE mydb FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
```

【**${\color{red}强制}$**】在开发使用PostgreSQL的应用程序时，应用程序应该捕获并处理数据库错误，记录数据库错误信息以便排查问题，并且应该根据错误类型进行相应的处理（如重试、回滚等），禁止将详细的数据库错误信息直接展示给用户，因为这可能暴露敏感信息（如数据库结构等）。（人工检查）

【**${\color{red}强制}$**】应用程序应该设置查询超时（例如使用statement_timeout参数或在应用层设置超时），以避免长时间运行的查询占用资源。（人工检查）

【**${\color{red}强制}$**】禁止在事务中混合读写和DDL操作，DDL在事务中可能导致锁冲突或不可回滚（如TRUNCATE）。（人工检查）

【**${\color{green}建议}$**】微服务架构下，推荐schema名称与服务一一对应，应用内不允许有跨schema的sql操作

【**${\color{green}建议}$**】可以通过以下手段防止SQL注入：
- 使用参数化查询；
- 限制数据库用户权限；
- 使用 prepared statement 预编译对象；

【**${\color{green}建议}$**】并行度使用需谨慎。

**注：** 使用并行需要考虑CPU核数，系统负载等情况，并行执行的SQL会对其它语句的性能产生影响。

【**${\color{green}建议}$**】应该尽量在业务层面避免死锁的产生，例如一个用户的数据，尽量在一个线程内处理，而不要跨线程。

【**${\color{green}建议}$**】应用程序配置文件中的pg连接URL中，可以考虑添加应用名称标识参数，例如：

```xml
ftf.datasource.druid.url=jdbc:postgresql://172.16.108.98:5432/rc_meta_dev?currentSchema=rc_meta_dev&ApplicationName=frankstan
```

可于pg活动实例pg_stat_activity表中体现，便于后期数据库问题排查分析

【**${\color{green}建议}$**】可以考虑于应用框架层面对于sql执行语句添加hint标注，并将sql来源设置进来，便于后续的sql日志采集分析：

例如：

```sql
2025-01-14T17:52:11.378293895+08:00 2025/01/14-17:52:11 DEBUG com.iwhalecloud.oss.product.res.biz.core.context.dal.persistent.itsp.dao.SrvExchangeLogDAO.insertEntity- ==>  Preparing: /**RES:jsdx-rom*/ insert into pm_srv_exchange_log ( exchange_id, interface_code, start_time, end_time, item_id, in_message, out_message, state ) values ( ?, ?, ?, ?, ?, ?, ?, ? )
```

【**${\color{green}建议}$**】建议应用框架层面对于select sql语句统一设置limit数量，最好不超过500条，特殊业务场景做例外处理。

【**${\color{green}建议}$**】大结果集处理推荐使用游标`cursor` + `fetch_size` 参数分批次获取。

【**${\color{green}建议}$**】在客户端应用程序中，应当避免在循环中执行SQL语句，应该尽量使用批量操作。

【**${\color{green}建议}$**】避免频繁创建和删除临时表，以减少系统表资源的消耗，因为创建临时表会产生元数据，频繁创建，元数据可能会出现碎片。

