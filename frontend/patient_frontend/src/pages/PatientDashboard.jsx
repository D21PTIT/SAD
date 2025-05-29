import { DollarOutlined, UserOutlined, WechatOutlined } from "@ant-design/icons";
import { Button, Card, Modal, Input, Spin } from "antd";
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import styled from "styled-components";
import { getPatientDetail } from "../redux/actions";

const Container = styled.div`
  max-width: 1000px;
  margin: 40px auto;
  padding: 0 16px;
`;

const Title = styled.h2`
  font-size: 30px;
  font-weight: 700;
  color: #28a745;
  margin-bottom: 24px;
`;

const StyledCard = styled(Card)`
  border-radius: 16px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  margin-bottom: 24px;
`;

const ActionButton = styled(Button)`
  background: #28a745;
  border-color: #28a745;
  color: white;
  border-radius: 10px;
  margin: 8px;
  &:hover {
    background: #218838;
    border-color: #218838;
  }
`;

const FloatingButton = styled(Button)`
  position: fixed;
  bottom: 30px;
  right: 30px;
  width: 60px;
  height: 60px;
  min-width: 60px;
  border-radius: 50%;
  background: #1890ff;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(24, 144, 255, 0.4);
  z-index: 1000;
  padding: 0 !important;
  transition: all 0.3s ease;
  
  &::before {
    content: '';
    display: block;
    width: 100%;
    height: 0;
    padding-bottom: 100%;
    position: absolute;
  }
  
  &:hover, &:focus {
    background: #40a9ff;
    border: none;
    box-shadow: 0 6px 16px rgba(24, 144, 255, 0.5);
    transform: translateY(-2px);
  }
  
  &:active {
    transform: translateY(0);
    box-shadow: 0 2px 8px rgba(24, 144, 255, 0.3);
  }
  
  .anticon {
    position: relative;
    z-index: 1;
  }
`;

const ChatContainer = styled.div`
  max-height: 400px;
  overflow-y: auto;
  margin-bottom: 16px;
  padding: 12px;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  background: #fafafa;
`;

const MessageWrapper = styled.div`
  display: flex;
  align-items: flex-end;
  margin: 12px 0;
  flex-direction: ${(props) => (props.sender === 'user' ? 'row-reverse' : 'row')};
`;

const Avatar = styled.div`
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: ${(props) => (props.sender === 'user' ? '#1890ff' : '#52c41a')};
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 14px;
  font-weight: bold;
  margin: ${(props) => (props.sender === 'user' ? '0 0 0 8px' : '0 8px 0 0')};
  flex-shrink: 0;
`;

const MessageBubble = styled.div`
  max-width: 70%;
  padding: 10px 14px;
  border-radius: 18px;
  background: ${(props) => (props.sender === 'user' ? '#1890ff' : '#ffffff')};
  color: ${(props) => (props.sender === 'user' ? '#ffffff' : '#333333')};
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  white-space: pre-wrap;
  position: relative;
  word-wrap: break-word;
  
  /* Speech bubble tail */
  &::before {
    content: '';
    position: absolute;
    bottom: 4px;
    width: 0;
    height: 0;
    border: 6px solid transparent;
    ${(props) => 
      props.sender === 'user' 
        ? `
          right: -6px;
          border-left-color: #1890ff;
          border-right: none;
        `
        : `
          left: -6px;
          border-right-color: #ffffff;
          border-left: none;
        `
    }
  }
`;

const FormattedMessage = styled.div`
  line-height: 1.5;
  
  .disease-title {
    font-weight: bold;
    color: #1890ff;
    font-size: 15px;
    margin-bottom: 8px;
    border-bottom: 2px solid #f0f0f0;
    padding-bottom: 4px;
  }
  
  .disease-item {
    margin: 12px 0;
    padding: 10px;
    background: #f8f9fa;
    border-radius: 8px;
    border-left: 4px solid #52c41a;
  }
  
  .disease-name {
    font-weight: bold;
    color: #d9534f;
    font-size: 14px;
    margin-bottom: 6px;
  }
  
  .disease-info {
    margin: 4px 0;
    
    strong {
      color: #595959;
      font-weight: 600;
    }
  }
  
  .symptoms, .medicines {
    color: #666;
    font-style: italic;
  }
  
  .advice {
    color: #1890ff;
    font-weight: 500;
  }
`;

const PatientDashboard = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const patientData = useSelector((state) => state.patient.patient);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const patientId = localStorage.getItem("patient_id");
    if (patientId) {
      dispatch(getPatientDetail(patientId)).catch(() => {
        toast.error("Không lấy được thông tin bệnh nhân!");
        navigate("/login");
      });
    } else {
      navigate("/login");
    }
  }, [dispatch, navigate]);

  if (!patientData) return <div>Đang tải...</div>;

  const patient = patientData.patient || {};

  const handleSendMessage = async () => {
    if (!inputText.trim()) return;

    const newMessage = { text: inputText, sender: 'user' };
    setMessages([...messages, newMessage]);
    setInputText('');
    setLoading(true);

    try {
      const response = await fetch('http://127.0.0.1:8023/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: inputText })
      });
      const data = await response.json();
      setMessages((prev) => [...prev, { text: data.response, sender: 'bot' }]);
      setLoading(false);
    } catch (error) {
      toast.error("Lỗi khi gọi API chatbot!");
      setLoading(false);
    }
  };

  // Function to format bot response
  const formatBotResponse = (text) => {
    if (!text.includes('Dự đoán các bệnh')) {
      return <span>{text}</span>;
    }

    const lines = text.split('\n');
    const elements = [];
    let currentDisease = null;
    let diseaseIndex = 0;

    lines.forEach((line, index) => {
      line = line.trim();
      if (!line) return;

      if (line.includes('Dự đoán các bệnh')) {
        elements.push(
          <div key={index} className="disease-title">
            🏥 {line}
          </div>
        );
      } else if (line.startsWith('- ') && line.includes('(') && line.includes('%)')) {
        if (currentDisease) {
          elements.push(
            <div key={`disease-${diseaseIndex}`} className="disease-item">
              {currentDisease}
            </div>
          );
          diseaseIndex++;
        }
        
        const diseaseName = line.substring(2, line.indexOf('('));
        const percentage = line.substring(line.indexOf('('));
        currentDisease = [
          <div key="name" className="disease-name">
            🔍 {diseaseName} <span style={{color: '#52c41a', fontSize: '12px'}}>{percentage}</span>
          </div>
        ];
      } else if (line.includes('Mô tả:')) {
        const description = line.replace('Mô tả:', '').trim();
        currentDisease.push(
          <div key="desc" className="disease-info">
            <strong>📋 Mô tả:</strong> {description}
          </div>
        );
      } else if (line.includes('Triệu chứng:')) {
        const symptoms = line.replace('Triệu chứng:', '').trim();
        currentDisease.push(
          <div key="symptoms" className="disease-info symptoms">
            <strong>🤒 Triệu chứng:</strong> {symptoms}
          </div>
        );
      } else if (line.includes('Thuốc gợi ý:')) {
        const medicines = line.replace('Thuốc gợi ý:', '').trim();
        currentDisease.push(
          <div key="medicines" className="disease-info medicines">
            <strong>💊 Thuốc gợi ý:</strong> {medicines}
          </div>
        );
      } else if (line.includes('Lời khuyên:')) {
        const advice = line.replace('Lời khuyên:', '').trim();
        currentDisease.push(
          <div key="advice" className="disease-info advice">
            <strong>💡 Lời khuyên:</strong> {advice}
          </div>
        );
      }
    });

    // Add the last disease if exists
    if (currentDisease) {
      elements.push(
        <div key={`disease-${diseaseIndex}`} className="disease-item">
          {currentDisease}
        </div>
      );
    }

    return <FormattedMessage>{elements}</FormattedMessage>;
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && inputText.trim()) {
      handleSendMessage();
    }
  };

  return (
    <Container>
      <Title>Chào mừng, {patient.ten}!</Title>
      <StyledCard>
        <p>
          <strong>Email:</strong> {patient.email}
        </p>
        <p>
          <strong>Số điện thoại:</strong> {patient.so_dt}
        </p>
      </StyledCard>
      <StyledCard title="Hành động nhanh">
        <ActionButton icon={<UserOutlined />}>
          <Link to="/detail">Xem/Cập nhật thông tin</Link>
        </ActionButton>
        <ActionButton icon={<UserOutlined />}>
          <Link to="/health-insurance">Quản lý bảo hiểm</Link>
        </ActionButton>
        <ActionButton icon={<UserOutlined />}>
          <Link to="/doctors">Tìm bác sĩ</Link>
        </ActionButton>
        <ActionButton icon={<DollarOutlined />}>
          <Link to="/payments">Thanh toán hóa đơn</Link>
        </ActionButton>
      </StyledCard>

      <FloatingButton
        icon={<WechatOutlined style={{ fontSize: '24px', color: '#fff' }} />}
        onClick={() => setIsModalVisible(true)}
      />

      <Modal
        title="Chatbot Y tế"
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        footer={null}
        width={450}
        style={{ position: 'fixed', bottom: 20, right: 20, top: 'auto' }}
        bodyStyle={{ padding: '16px' }}
      >
        <ChatContainer>
          {messages.map((msg, index) => (
            <MessageWrapper key={index} sender={msg.sender}>
              <Avatar sender={msg.sender}>
                {msg.sender === 'user' ? 'B' : '🤖'}
              </Avatar>
              <MessageBubble sender={msg.sender}>
                {msg.sender === 'bot' ? formatBotResponse(msg.text) : msg.text}
              </MessageBubble>
            </MessageWrapper>
          ))}
          {loading && (
            <MessageWrapper sender="bot">
              <Avatar sender="bot">🤖</Avatar>
              <MessageBubble sender="bot">
                <Spin size="small" /> Đang suy nghĩ...
              </MessageBubble>
            </MessageWrapper>
          )}
        </ChatContainer>
        <Input
          placeholder="Nhập triệu chứng của bạn..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyPress={handleKeyPress}
          suffix={
            <Button
              type="primary"
              onClick={handleSendMessage}
              disabled={!inputText.trim() || loading}
            >
              Gửi
            </Button>
          }
        />
      </Modal>
    </Container>
  );
};

export default PatientDashboard;
