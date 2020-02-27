# Redis using AWS Elasticache service

locals {
  cluster_name = "${var.environment}-redis"
}

# Security Group Resources
resource "aws_security_group" "default" {
  vpc_id = var.vpc_id
  name   = "${local.cluster_name}-SG"
}

resource "aws_security_group_rule" "egress" {
  description       = "Allow all egress traffic"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = join("", aws_security_group.default.*.id)
  type              = "egress"
}

resource "aws_security_group_rule" "ingress_security_groups" {
  description              = "Allow inbound traffic from VPC sg"
  from_port                = var.port
  to_port                  = var.port
  protocol                 = "tcp"
  source_security_group_id = var.allowed_security_group
  security_group_id        = join("", aws_security_group.default.*.id)
  type                     = "ingress"
}

resource "aws_security_group_rule" "ingress_cidr_blocks" {
  description       = "Allow inbound traffic from CIDR blocks"
  from_port         = var.port
  to_port           = var.port
  protocol          = "tcp"
  cidr_blocks       = [var.allowed_cidr_block]
  security_group_id = join("", aws_security_group.default.*.id)
  type              = "ingress"
}

resource "aws_elasticache_subnet_group" "default" {
  name       = local.cluster_name
  subnet_ids = var.subnets
}

resource "aws_elasticache_parameter_group" "default" {
  name   = local.cluster_name
  family = "redis${var.engine_version}"

}

resource "aws_elasticache_cluster" "default" {
  cluster_id           = "${var.environment}-redis"
  engine               = "redis"
  node_type            = var.instance_type
  num_cache_nodes      = 1
  parameter_group_name = aws_elasticache_parameter_group.default.name
  engine_version       = var.engine_version
  port                 = var.port
  subnet_group_name    = aws_elasticache_subnet_group.default.name
  security_group_ids   = [aws_security_group.default.id]
}
