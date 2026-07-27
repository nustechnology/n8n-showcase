import { OrderDetail } from "@/components/domain/order-detail";

type Params = Promise<{ orderId: string }>;

export default async function OrderDetailPage(props: { params: Params }) {
  const { orderId } = await props.params;
  return <OrderDetail orderId={orderId} />;
}
