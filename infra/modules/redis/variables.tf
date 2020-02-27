variable "environment" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "subnets" {
  type = list(string)
}

variable "instance_type" {
  # Pick from t, m, or r series EC2 instance types
  type    = string
  default = "cache.t3.micro"
}

variable "engine_version" {
  type = string
  default = "4.0.10"
}

variable "port" {
  type    = number
  default = 6379
}

variable "allowed_cidr_block" {
  type = string
}

variable "allowed_security_group" {
  type = string
}

