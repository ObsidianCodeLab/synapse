import { FileTextOutlined, CodeOutlined } from '@ant-design/icons';
import { useDashboard } from '@rd-view/context/DashboardContext';

function ProductOutputCard({
  productName,
  docCount,
  codeCount,
}: {
  productName: string;
  docCount: number;
  codeCount: number;
}) {
  return (
    <div className="assistant-output-product-card">
      <div className="assistant-output-product-name" title={productName}>
        {productName}
      </div>
      <div className="assistant-output-product-metrics">
        <span className="assistant-output-metric assistant-output-metric--doc">
          <FileTextOutlined />
          文档 {docCount}
        </span>
        <span className="assistant-output-metric assistant-output-metric--code">
          <CodeOutlined />
          代码 {codeCount}
        </span>
      </div>
    </div>
  );
}

export function AssistantOutputPopoverContent() {
  const { dashboard } = useDashboard();
  const products = dashboard.details.assistantOutput;

  return (
    <div className="efficiency-popover assistant-output-popover">
      <div className="efficiency-popover-header">
        研发助手产出明细
      </div>
      <div className="assistant-output-product-grid">
        {products.map((item) => (
          <ProductOutputCard
            key={item.productName}
            productName={item.productName}
            docCount={item.docCount}
            codeCount={item.codeCount}
          />
        ))}
      </div>
    </div>
  );
}
